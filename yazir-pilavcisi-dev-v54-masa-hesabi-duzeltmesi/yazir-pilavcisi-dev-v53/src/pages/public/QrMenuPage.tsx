import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCartStore } from '@/stores/cartStore';
import { supabase } from '@/lib/supabase';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

export default function QrMenuPage() {
  const { token } = useParams<{ token: string }>();
  const setTableToken = useCartStore((s) => s.setTableToken);
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    if (!token) {
      navigate('/menu', { replace: true });
      return;
    }

    const verify = async () => {
      try {
        const { data, error } = await supabase.rpc('resolve_table_qr', { p_token: token });
        if (error || !data) {
          toast.error('Geçersiz veya süresi dolmuş QR kod');
          navigate('/menu', { replace: true });
          return;
        }
        setTableToken(token);
        const res = data as any;
        toast.success(`Masa ${res.table_number || ''} · Hoş geldiniz!`, { duration: 4000 });
        navigate('/menu', { replace: true });
      } catch (err) {
        toast.error('Masa bilgisi doğrulanamadı');
        navigate('/menu', { replace: true });
      } finally {
        setVerifying(false);
      }
    };
    verify();
  }, [token, setTableToken, navigate]);

  if (verifying) return <LoadingSpinner text="Masa bilgisi doğrulanıyor..." />;

  return null;
}
