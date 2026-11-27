import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { CustomerAddress } from '@/types/database';

export function useCustomerAddresses() {
  const { user } = useAuthStore();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAddresses = useCallback(async () => {
    if (!user) {
      setAddresses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: custData } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', user.id)
          .single();

      if (custData) {
        const { data: addrData } = await supabase
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', (custData as any).id)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });

        if (addrData) setAddresses(addrData as unknown as CustomerAddress[]);
      }
    } catch (e) {
      console.error('Error fetching addresses:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const addAddress = async (addr: {
    title: string;
    full_address: string;
    district?: string;
    lat?: number | null;
    lng?: number | null;
    is_default?: boolean;
  }) => {
    if (!user) throw new Error('Oturum açmalısınız');

    const { data: custData } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!custData) throw new Error('Müşteri kaydı bulunamadı');

    const customerId = (custData as any).id;

    if (addr.is_default) {
      await supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('customer_id', customerId);
    }

    const { error } = await supabase.from('customer_addresses').insert({
      customer_id: customerId,
      title: addr.title || 'Adres',
      full_address: addr.full_address,
      district: addr.district || null,
      lat: addr.lat || null,
      lng: addr.lng || null,
      is_default: !!addr.is_default || addresses.length === 0,
    });

    if (error) throw error;
    await fetchAddresses();
  };

  const updateAddress = async (
      id: string,
      addr: Partial<{
        title: string;
        full_address: string;
        district?: string;
        lat?: number | null;
        lng?: number | null;
        is_default?: boolean;
      }>,
  ) => {
    if (!user) throw new Error('Oturum açmalısınız');

    const { error } = await supabase
        .from('customer_addresses')
        .update(addr)
        .eq('id', id);

    if (error) throw error;
    await fetchAddresses();
  };

  const deleteAddress = async (id: string) => {
    if (!user) throw new Error('Oturum açmalısınız');
    const { error } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', id);

    if (error) throw error;
    await fetchAddresses();
  };

  return { addresses, loading, refetch: fetchAddresses, addAddress, updateAddress, deleteAddress };
}