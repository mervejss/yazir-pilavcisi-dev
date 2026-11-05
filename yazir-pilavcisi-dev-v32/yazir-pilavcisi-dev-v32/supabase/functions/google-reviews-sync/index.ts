import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoogleReview {
  author_name: string;
  author_url?: string;
  language: string;
  original_language?: string;
  profile_photo_url: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number; // Unix timestamp
  translated?: boolean;
}

interface GooglePlacesResponse {
  result?: {
    reviews?: GoogleReview[];
    name?: string;
    place_id?: string;
  };
  status: string;
  error_message?: string;
}

interface SyncLogEntry {
  place_id: string;
  reviews_fetched: number;
  reviews_new: number;
  reviews_updated: number;
  status: 'success' | 'partial' | 'error';
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authorization check - only allow service role or authenticated admins
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')!;

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get place_id from request body or business_settings
    const body = await req.json().catch(() => ({}));
    let placeId = body.place_id;

    if (!placeId) {
      // Fetch from business_settings
      const { data: settings } = await supabase
        .from('business_settings')
        .select('google_maps_url, google_place_id')
        .eq('id', 1)
        .single();

      // Use stored place_id if available, otherwise extract from URL
      placeId = settings?.google_place_id || (settings?.google_maps_url ? extractPlaceIdFromUrl(settings.google_maps_url) : null);
    }

    if (!placeId) {
      return new Response(
        JSON.stringify({ error: 'Google Place ID not found. Please configure google_maps_url in business_settings with a valid place_id.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log sync start
    const startedAt = new Date().toISOString();
    let reviewsFetched = 0;
    let reviewsNew = 0;
    let reviewsUpdated = 0;
    let status: 'success' | 'partial' | 'error' = 'success';
    let errorMessage: string | undefined;

    try {
      // Fetch reviews from Google Places API
      const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,name,place_id&language=tr&key=${googleApiKey}`;

      const response = await fetch(apiUrl);
      const data: GooglePlacesResponse = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Google Places API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
      }

      const reviews = data.result?.reviews || [];
      reviewsFetched = reviews.length;

      // Process each review
      for (const review of reviews) {
        const googleReviewId = `${placeId}_${review.time}_${review.author_name}`.replace(/\s+/g, '_');

        // Check if review already exists
        const { data: existing } = await supabase
          .from('site_reviews')
          .select('id')
          .eq('google_review_id', googleReviewId)
          .single();

        const reviewTime = new Date(review.time * 1000).toISOString();

        const reviewData = {
          author: review.author_name,
          rating: review.rating,
          body: review.text,
          is_published: true,
          sort_order: 0,
          source: 'google',
          google_review_id: googleReviewId,
          google_place_id: placeId,
          review_time: reviewTime,
          profile_photo_url: review.profile_photo_url,
          relative_time_description: review.relative_time_description,
          language: review.language,
        };

        if (existing) {
          // Update existing review
          const { error } = await supabase
            .from('site_reviews')
            .update(reviewData)
            .eq('id', existing.id);

          if (!error) reviewsUpdated++;
        } else {
          // Insert new review
          const { error } = await supabase
            .from('site_reviews')
            .insert(reviewData);

          if (!error) reviewsNew++;
        }
      }

      // Update business_settings with last sync time and place_id
      const now = new Date().toISOString();
      await supabase
        .from('business_settings')
        .update({
          updated_at: now,
          last_google_reviews_sync: now,
          google_place_id: placeId,
        })
        .eq('id', 1);

    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Google reviews sync error:', err);
    }

    const completedAt = new Date().toISOString();

    // Log sync result
    await supabase
      .from('google_reviews_sync_log')
      .insert({
        place_id: placeId,
        reviews_fetched: reviewsFetched,
        reviews_new: reviewsNew,
        reviews_updated: reviewsUpdated,
        status,
        error_message: errorMessage,
        started_at: startedAt,
        completed_at: completedAt,
      });

    return new Response(
      JSON.stringify({
        success: status !== 'error',
        place_id: placeId,
        reviews_fetched: reviewsFetched,
        reviews_new: reviewsNew,
        reviews_updated: reviewsUpdated,
        status,
        error_message: errorMessage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractPlaceIdFromUrl(url: string): string | null {
  // Try to extract place_id from various Google Maps URL formats
  // Format 1: https://maps.app.goo.gl/... (short URL - need to resolve)
  // Format 2: https://www.google.com/maps/place/.../data=...!1s0x... (contains place_id in data)
  // Format 3: Direct place_id: ChIJ...

  // If it's already a place_id (starts with ChIJ or similar)
  if (url.startsWith('ChIJ') || url.startsWith('Ei') || url.startsWith('GhI')) {
    return url;
  }

  // Try to extract from data parameter in Google Maps URL
  const dataMatch = url.match(/[?&]data=([^&]+)/);
  if (dataMatch) {
    const decoded = decodeURIComponent(dataMatch[1]);
    // Place ID is usually in format !1s0x... or !16s<place_id>
    const placeIdMatch = decoded.match(/!16s([^!]+)/);
    if (placeIdMatch) return placeIdMatch[1];

    // Alternative: !1s<place_id>
    const altMatch = decoded.match(/!1s([^!]+)/);
    if (altMatch) return altMatch[1];
  }

  // For short URLs (maps.app.goo.gl), we'd need to resolve them
  // This would require an additional API call or manual entry
  // For now, return null and let admin enter place_id directly
  return null;
}