import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FEEDBACK_TYPE_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/helpers';
import toast from 'react-hot-toast';

interface FeedbackItem {
  id: string;
  name: string;
  contact: string | null;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function FeedbackAdmin() {
  const [list, setList] = useState<FeedbackItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const fetchFeedback = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setList(data as unknown as FeedbackItem[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      const { error } = await supabase.from('feedback').update({ is_read: true }).eq('id', id);
      if (error) throw error;
      setList(list.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
      toast.success('Okundu olarak işaretlendi');
    } catch (err: any) {
      toast.error(err.message || 'Güncellenemedi');
    }
  };

  const filtered = list.filter((item) => {
    if (filter === 'unread') return !item.is_read;
    if (filter !== 'all') return item.type === filter;
    return true;
  });

  return (
    <>
      <div className="bar">
        <div>
          <h1>Müşteri Geri Bildirimleri</h1>
          <p className="muted" style={{ margin: 0 }}>
            İnternet sitesinden gönderilen öneri, teşekkür ve şikayet mesajları
          </p>
        </div>
        <div className="seg">
          <button
            type="button"
            className={filter === 'all' ? 'on' : ''}
            onClick={() => setFilter('all')}
          >
            Tümü ({list.length})
          </button>
          <button
            type="button"
            className={filter === 'unread' ? 'on' : ''}
            onClick={() => setFilter('unread')}
          >
            Okunmamış ({list.filter((x) => !x.is_read).length})
          </button>
        </div>
      </div>

      <div className="list">
        {filtered.map((item) => (
          <div key={item.id} className={`card fb${item.is_read ? '' : ' unread'}`}>
            <div className="orow">
              <b>{item.name}</b>
              <span className="chip">
                {FEEDBACK_TYPE_LABELS[item.type] || item.type}
              </span>
            </div>
            <p style={{ margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>{item.message}</p>
            <div className="orow">
              <small className="muted">
                {formatDateTime(item.created_at)}
                {item.contact && ` · İletişim: ${item.contact}`}
              </small>
              {!item.is_read && (
                <button
                  type="button"
                  className="btn ghost dark sm"
                  onClick={() => handleMarkRead(item.id)}
                >
                  Okundu Olarak İşaretle
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="muted center" style={{ padding: '3rem' }}>
            {loading ? 'Yükleniyor...' : 'Kayıt bulunamadı.'}
          </p>
        )}
      </div>
    </>
  );
}
