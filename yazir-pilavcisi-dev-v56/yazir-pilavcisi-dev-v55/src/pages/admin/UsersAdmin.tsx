import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LABELS } from '@/lib/constants';
import { PERMISSION_DESCRIPTIONS, COURIER_BUILTIN, ROLE_DESCRIPTIONS } from '@/lib/staffPermissions';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

interface StaffUser {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: 'owner' | 'sub_admin' | 'operator' | 'courier' | 'customer';
  is_active: boolean;
  created_at: string;
}

interface PermissionItem {
  key: string;
  label: string;
  description?: string | null;
  group_name: string;
  sort_order: number;
}

interface StaffPermissionOverride {
  permission_key: string;
  granted: boolean;
}

/** Personel hesabı işlemleri (Edge Function: staff-admin). Hata mesajını Türkçe ve anlaşılır döndürür. */
async function callStaffAdmin(action: 'create' | 'update', payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('staff-admin', { body: { action, ...payload } });
  if (error) {
    let serverMsg = '';
    try {
      const res = (error as any).context as Response | undefined;
      if (res && typeof res.json === 'function') serverMsg = (await res.json())?.error || '';
    } catch {
      /* gövde okunamadı */
    }
    if (serverMsg) throw new Error(serverMsg);
    throw new Error(
      'Personel fonksiyonuna ulaşılamadı. Edge Function dağıtıldı mı? (supabase functions deploy staff-admin --no-verify-jwt)',
    );
  }
  if (!data?.ok) throw new Error(data?.error || 'İşlem başarısız');
  return data as { ok: true; id?: string; adopted?: boolean };
}

export default function UsersAdmin() {
  const { profile, isOwner } = useAuthStore();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleTab, setSelectedRoleTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [addStaffModal, setAddStaffModal] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<StaffUser | null>(null);
  const [newRole, setNewRole] = useState<string>('operator');
  const [permissionsModalUser, setPermissionsModalUser] = useState<StaffUser | null>(null);
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Permissions Catalog & Current user's overrides
  const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>({});
  const [savingPermission, setSavingPermission] = useState<string | null>(null);

  // New staff form state
  const [newStaff, setNewStaff] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'operator' as 'owner' | 'sub_admin' | 'operator' | 'courier',
  });
  const [addingStaff, setAddingStaff] = useState(false);

  // Fetch all staff users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('role', 'customer')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setUsers(data as unknown as StaffUser[]);
    } catch (err: any) {
      console.error('Fetch users error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch permissions catalog & role defaults
  const fetchPermissionsCatalog = useCallback(async () => {
    try {
      const [permRes, rolePermRes] = await Promise.all([
        supabase.from('permissions').select('*').order('sort_order'),
        supabase.from('role_permissions').select('*'),
      ]);

      if (permRes.data) {
        setAllPermissions(permRes.data as PermissionItem[]);
      }

      if (rolePermRes.data) {
        const mapping: Record<string, string[]> = {};
        for (const item of rolePermRes.data as Array<{ role: string; permission_key: string }>) {
          if (!mapping[item.role]) mapping[item.role] = [];
          mapping[item.role].push(item.permission_key);
        }
        setRolePermissions(mapping);
      }
    } catch (err: any) {
      console.error('Fetch permissions catalog error:', err);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchPermissionsCatalog();
  }, [fetchUsers, fetchPermissionsCatalog]);

  // Load permissions for selected user in modal
  const openPermissionsModal = async (user: StaffUser) => {
    setPermissionsModalUser(user);
    setUserOverrides({});

    try {
      const { data, error } = await supabase
        .from('staff_permissions')
        .select('permission_key, granted')
        .eq('user_id', user.id);

      if (error) throw error;

      const overrides: Record<string, boolean> = {};
      if (data) {
        for (const row of data as StaffPermissionOverride[]) {
          overrides[row.permission_key] = row.granted;
        }
      }
      setUserOverrides(overrides);
    } catch (err: any) {
      console.error('Fetch staff permissions error:', err);
      toast.error('Yetkiler yüklenirken hata oluştu');
    }
  };

  // Rolün varsayılanı (veritabanındaki role_permissions)
  const roleDefault = (user: StaffUser, permKey: string): boolean => {
    if (user.role === 'owner') return true;
    return (rolePermissions[user.role] || []).includes(permKey);
  };

  // Etkin yetki: sahip → hepsi · kişiye özel ayar varsa o · yoksa rolün varsayılanı (veritabanındaki hesaplamayla aynı)
  const hasPermission = (user: StaffUser, permKey: string): boolean => {
    if (user.role === 'owner') return true;
    if (user.role !== 'sub_admin' && user.role !== 'operator') return false;
    if (userOverrides[permKey] !== undefined) return userOverrides[permKey];
    return roleDefault(user, permKey);
  };

  // Toggle permission for a staff member (anında veritabanına yazılır, sonraki her sorguda geçerlidir)
  const handleTogglePermission = async (permKey: string) => {
    if (!permissionsModalUser) return;
    if (permissionsModalUser.role === 'owner') {
      toast('İşletme sahibi tüm yetkilere doğal olarak sahiptir', { icon: '👑' });
      return;
    }
    if (!isOwner()) {
      toast.error('Yalnızca işletme sahibi yetki değiştirebilir');
      return;
    }

    const user = permissionsModalUser;
    setSavingPermission(permKey);
    const nextState = !hasPermission(user, permKey);
    const prevOverride = userOverrides[permKey];
    const isDefault = nextState === roleDefault(user, permKey);

    // Ekran anında güncellensin; hata olursa geri alınır
    setUserOverrides((prev) => {
      const copy = { ...prev };
      if (isDefault) delete copy[permKey];
      else copy[permKey] = nextState;
      return copy;
    });

    try {
      if (isDefault) {
        // Rolün varsayılanına eşitse özel ayara gerek yok → satırı sil
        const { error } = await supabase
          .from('staff_permissions')
          .delete()
          .eq('user_id', user.id)
          .eq('permission_key', permKey);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('set_staff_permission', {
          p_user: user.id,
          p_permission: permKey,
          p_granted: nextState,
        });
        if (error) throw error;
      }
      toast.success(nextState ? 'Yetki verildi — hemen geçerli' : 'Yetki kaldırıldı — hemen geçerli');
    } catch (err: any) {
      setUserOverrides((prev) => {
        const copy = { ...prev };
        if (prevOverride === undefined) delete copy[permKey];
        else copy[permKey] = prevOverride;
        return copy;
      });
      toast.error(err.message || 'Yetki güncellenemedi');
    } finally {
      setSavingPermission(null);
    }
  };

  // Grant All Permissions to the selected user
  const handleGrantAllPermissions = async () => {
    if (!permissionsModalUser || !isOwner()) return;
    const user = permissionsModalUser;
    try {
      const { error } = await supabase.rpc('set_staff_permissions_bulk', {
        p_user: user.id,
        p_keys: allPermissions.map((p) => p.key),
        p_granted: true,
      });
      if (error) throw error;

      const newOverrides: Record<string, boolean> = {};
      for (const p of allPermissions) newOverrides[p.key] = true;
      setUserOverrides(newOverrides);
      toast.success('Tüm yetkiler verildi — hemen geçerli');
    } catch (err: any) {
      toast.error(err.message || 'Yetkiler güncellenemedi');
    }
  };

  // Reset to Role Defaults
  const handleResetToRoleDefaults = async () => {
    if (!permissionsModalUser || !isOwner()) return;
    try {
      const { error } = await supabase
        .from('staff_permissions')
        .delete()
        .eq('user_id', permissionsModalUser.id);

      if (error) throw error;

      setUserOverrides({});
      toast.success('Rolün varsayılan yetkilerine sıfırlandı — hemen geçerli');
    } catch (err: any) {
      toast.error(err.message || 'Sıfırlanamadı');
    }
  };

  // Toggle user active status
  const handleToggleActive = async (user: StaffUser) => {
    if (user.id === profile?.id) {
      toast.error('Kendi hesabınızı pasifleştiremezsiniz');
      return;
    }
    if (!isOwner()) {
      toast.error('Yalnızca işletme sahibi aktiflik durumunu değiştirebilir');
      return;
    }

    try {
      const { error } = await supabase.rpc('set_staff_active', {
        p_user: user.id,
        p_active: !user.is_active,
      });

      if (error) throw error;
      toast.success(!user.is_active ? 'Kullanıcı aktifleştirildi' : 'Kullanıcı pasifleştirildi');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'İşlem başarısız');
    }
  };

  // Change staff role
  const handleChangeRole = async () => {
    if (!roleModalUser) return;
    if (roleModalUser.id === profile?.id) {
      toast.error('Kendi rolünüzü değiştiremezsiniz');
      return;
    }
    if (!isOwner()) {
      toast.error('Yalnızca işletme sahibi rol atayabilir');
      return;
    }

    try {
      const { error } = await supabase.rpc('set_staff_role', {
        p_user: roleModalUser.id,
        p_role: newRole as any,
      });

      if (error) throw error;
      toast.success('Rol başarıyla güncellendi');
      setRoleModalUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Rol atanamadı');
    }
  };

  // Remove staff member (demote from staff to customer)
  const handleRemoveStaff = async (user: StaffUser) => {
    if (!isOwner()) {
      toast.error('Yalnızca işletme sahibi personel çıkarabilir');
      return;
    }
    if (user.id === profile?.id) {
      toast.error('Kendi hesabınızı personelden çıkaramazsınız');
      return;
    }

    const confirmed = window.confirm(
      `"${user.full_name}" adlı personeli kadrodan çıkarmak istediğinize emin misiniz?\n\nBu işlem personelin rolünü 'müşteri' yapar ve yetkilerini kaldırır.`,
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc('remove_staff_member', { p_user: user.id });
      if (error) throw error;

      toast.success(`"${user.full_name}" kadrodan çıkarıldı`);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Personel çıkarılamadı');
    }
  };

  // Add New Staff Member (Edge Function: hesap açılır, e-posta onaylı gelir, rol aynı adımda yazılır)
  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner()) {
      toast.error('Yalnızca işletme sahibi yeni personel ekleyebilir');
      return;
    }

    if (!newStaff.email.trim() || !newStaff.password || !newStaff.full_name.trim()) {
      toast.error('Lütfen zorunlu alanları doldurun');
      return;
    }

    if (newStaff.password.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır');
      return;
    }

    setAddingStaff(true);
    try {
      const res = await callStaffAdmin('create', {
        full_name: newStaff.full_name.trim(),
        email: newStaff.email.trim(),
        password: newStaff.password,
        phone: newStaff.phone.trim(),
        role: newStaff.role,
      });

      toast.success(
        res.adopted
          ? `"${newStaff.full_name}" mevcut hesaptan personele çevrildi (şifre güncellendi)`
          : `"${newStaff.full_name}" personel olarak eklendi`,
      );
      setAddStaffModal(false);
      setNewStaff({ full_name: '', email: '', password: '', phone: '', role: 'operator' });
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Personel eklenemedi');
    } finally {
      setAddingStaff(false);
    }
  };

  // Mevcut personelin ad / e-posta / telefon / şifre bilgisini düzenle
  const openEditModal = (user: StaffUser) => {
    setEditUser(user);
    setEditForm({ full_name: user.full_name || '', email: user.email || '', phone: user.phone || '', password: '' });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    if (!isOwner()) {
      toast.error('Yalnızca işletme sahibi personel bilgisi değiştirebilir');
      return;
    }
    if (!editForm.full_name.trim()) {
      toast.error('Ad soyad boş olamaz');
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      toast.error('Yeni şifre en az 6 karakter olmalıdır');
      return;
    }

    const emailChanged = editForm.email.trim().toLowerCase() !== (editUser.email || '').toLowerCase();
    setSavingEdit(true);
    try {
      if (!emailChanged && !editForm.password) {
        // Yalnızca ad / telefon: Edge Function gerekmez
        const { error } = await supabase.rpc('staff_update_profile', {
          p_user: editUser.id,
          p_name: editForm.full_name.trim(),
          p_phone: editForm.phone.trim(),
        });
        if (error) throw error;
      } else {
        await callStaffAdmin('update', {
          id: editUser.id,
          full_name: editForm.full_name.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim(),
          password: editForm.password,
        });
      }
      toast.success('Personel bilgileri güncellendi');
      setEditUser(null);
      await fetchUsers();
      if (editUser.id === profile?.id) await useAuthStore.getState().fetchProfile();
    } catch (err: any) {
      toast.error(err.message || 'Bilgiler güncellenemedi');
    } finally {
      setSavingEdit(false);
    }
  };

  // Filtered users by role tab and search query
  const filteredUsers = users.filter((u) => {
    const matchesRole =
      selectedRoleTab === 'all'
        ? true
        : selectedRoleTab === 'manager'
        ? u.role === 'owner' || u.role === 'sub_admin'
        : u.role === selectedRoleTab;

    const matchesSearch =
      !searchQuery.trim() ||
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.phone && u.phone.includes(searchQuery));

    return matchesRole && matchesSearch;
  });

  // Group permissions by group_name
  const groupedPermissions: Record<string, PermissionItem[]> = {};
  for (const perm of allPermissions) {
    const grp = perm.group_name || 'Diğer';
    if (!groupedPermissions[grp]) groupedPermissions[grp] = [];
    groupedPermissions[grp].push(perm);
  }

  return (
    <>
      <div className="bar">
        <div>
          <h1>Personel ve Yetkilendirme</h1>
          <p className="muted" style={{ margin: 0 }}>
            İşletme sahibi, yöneticiler, operatörler ve kuryelerin rolleri, telefonları ve yetki matrisi
          </p>
        </div>
        {isOwner() && (
          <button
            type="button"
            className="btn gold sm"
            onClick={() => setAddStaffModal(true)}
          >
            + Yeni Personel Ekle
          </button>
        )}
      </div>

      {/* Role Tabs and Search Filter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.2rem',
          background: 'var(--card-bg)',
          padding: '0.8rem 1rem',
          borderRadius: '12px',
          border: '1px solid var(--line)',
        }}
      >
        <div className="seg" style={{ margin: 0 }}>
          <button
            type="button"
            className={selectedRoleTab === 'all' ? 'on' : ''}
            onClick={() => setSelectedRoleTab('all')}
          >
            Tüm Personel ({users.length})
          </button>
          <button
            type="button"
            className={selectedRoleTab === 'manager' ? 'on' : ''}
            onClick={() => setSelectedRoleTab('manager')}
          >
            Sahipler & Yöneticiler ({users.filter((u) => u.role === 'owner' || u.role === 'sub_admin').length})
          </button>
          <button
            type="button"
            className={selectedRoleTab === 'operator' ? 'on' : ''}
            onClick={() => setSelectedRoleTab('operator')}
          >
            Operatörler ({users.filter((u) => u.role === 'operator').length})
          </button>
          <button
            type="button"
            className={selectedRoleTab === 'courier' ? 'on' : ''}
            onClick={() => setSelectedRoleTab('courier')}
          >
            Kuryeler ({users.filter((u) => u.role === 'courier').length})
          </button>
        </div>

        <div style={{ minWidth: '220px', flex: '0 1 280px' }}>
          <input
            type="text"
            placeholder="🔍 Personel ara (ad, e-posta, tel)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', margin: 0, padding: '0.45em 0.8em' }}
          />
        </div>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th>Ad Soyad & E-posta</th>
            <th>Telefon</th>
            <th>Rol</th>
            <th>Aktiflik</th>
            <th>Yetkiler</th>
            <th style={{ textAlign: 'right' }}>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((u) => {
            const isMe = u.id === profile?.id;
            const roleColor =
              u.role === 'owner'
                ? '#f2b705'
                : u.role === 'sub_admin'
                ? '#b8e6ff'
                : u.role === 'operator'
                ? '#d4f2d6'
                : '#ffe2b8';

            return (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: roleColor,
                        color: '#14110c',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}
                    >
                      {u.full_name?.charAt(0).toUpperCase() || 'P'}
                    </div>
                    <div>
                      <b>
                        {u.full_name} {isMe && <span className="small muted">(Siz)</span>}
                      </b>
                      <div className="small muted">{u.email || '—'}</div>
                    </div>
                  </div>
                </td>
                <td>{u.phone || '—'}</td>
                <td>
                  <span
                    className="chip"
                    style={{
                      background: roleColor,
                      color: '#14110c',
                      fontWeight: 700,
                      border: '1px solid rgba(0,0,0,0.1)',
                    }}
                  >
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </td>
                <td>
                  <Switch
                    checked={u.is_active}
                    onChange={() => handleToggleActive(u)}
                    label="Aktiflik"
                    disabled={isMe || !isOwner()}
                  />
                </td>
                <td>
                  {u.role === 'owner' ? (
                    <span className="small" style={{ color: 'var(--gold-ink)', fontWeight: 700 }}>
                      👑 Tam Yetkili
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ padding: '0.25em 0.6em', fontSize: '0.8rem' }}
                      onClick={() => openPermissionsModal(u)}
                    >
                      🔑 Yetkileri Gör & Yönet
                    </button>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '4px' }}>
                    {isOwner() && (
                      <button
                        type="button"
                        className="btn ghost sm"
                        style={{ padding: '0.3em 0.6em', fontSize: '0.8rem' }}
                        onClick={() => openEditModal(u)}
                        title="Ad, e-posta, telefon, şifre düzenle"
                      >
                        ✏️ Düzenle
                      </button>
                    )}
                    {isOwner() && !isMe && (
                      <>
                        <button
                          type="button"
                          className="btn ghost sm"
                          style={{ padding: '0.3em 0.6em', fontSize: '0.8rem' }}
                          onClick={() => {
                            setRoleModalUser(u);
                            setNewRole(u.role);
                          }}
                          title="Rolü Değiştir"
                        >
                          👤 Rol
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          style={{ padding: '0.3em 0.6em', fontSize: '0.8rem', color: 'var(--danger)' }}
                          onClick={() => handleRemoveStaff(u)}
                          title="Personeli Kadrodan Çıkar"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {filteredUsers.length === 0 && (
            <tr>
              <td colSpan={6} className="center muted" style={{ padding: '2.5rem' }}>
                {loading ? 'Personel listesi yükleniyor...' : 'Bu kategoride kayıtlı personel bulunamadı.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Yetki ve Rol Açıklama Kartı */}
      <div className="card" style={{ marginTop: '1.5rem', padding: '1.2rem' }}>
        <h3>Yetki ve Rol Hiyerarşisi</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.8rem' }}>
          <div style={{ background: 'var(--surface)', padding: '0.8rem', borderRadius: '10px' }}>
            <b style={{ color: 'var(--gold-ink)' }}>👑 İşletme Sahibi (Owner)</b>
            <p className="small muted" style={{ margin: '0.3rem 0 0' }}>
              Sisteme tam yetkilidir. Personel ekleyebilir, rolleri ve özel yetkileri değiştirebilir, ciro ve denetim kayıtlarını görür.
            </p>
          </div>
          <div style={{ background: 'var(--surface)', padding: '0.8rem', borderRadius: '10px' }}>
            <b>🛡️ Yönetici (Sub-Admin)</b>
            <p className="small muted" style={{ margin: '0.3rem 0 0' }}>
              Sahip tarafından verilen yetkilerle günlük operasyonları, siparişleri ve masaları yönetir.
            </p>
          </div>
          <div style={{ background: 'var(--surface)', padding: '0.8rem', borderRadius: '10px' }}>
            <b>💻 Operatör (Kasa / Sipariş)</b>
            <p className="small muted" style={{ margin: '0.3rem 0 0' }}>
              Sipariş alma, sipariş hazırlama ve masa hesabı kapatma işlemlerini yürütür.
            </p>
          </div>
          <div style={{ background: 'var(--surface)', padding: '0.8rem', borderRadius: '10px' }}>
            <b>🛵 Kurye</b>
            <p className="small muted" style={{ margin: '0.3rem 0 0' }}>
              Yalnızca kendisine atanan paketleri görür, canlı konum gönderir ve teslimat durumunu günceller.
            </p>
          </div>
        </div>
      </div>

      {/* YENİ PERSONEL EKLE MODAL */}
      <Modal open={addStaffModal} onClose={() => !addingStaff && setAddStaffModal(false)}>
        <h2>Yeni Personel Ekle</h2>
        <p className="muted small">
          Yeni personel için giriş hesabı ve seçilen yetki rolünü tanımlayın.
        </p>

        <form onSubmit={handleAddStaffSubmit} className="form">
          <label>
            Personel Adı Soyadı *
            <input
              required
              value={newStaff.full_name}
              onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })}
              placeholder="Örn: Ahmet Yılmaz"
            />
          </label>

          <label>
            E-posta Adresi (Giriş için) *
            <input
              type="email"
              required
              value={newStaff.email}
              onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
              placeholder="ahmet@yazirpilavcisi.com"
            />
          </label>

          <label>
            Giriş Şifresi *
            <input
              type="password"
              required
              minLength={6}
              value={newStaff.password}
              onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
              placeholder="En az 6 karakter"
            />
          </label>

          <label>
            Telefon Numarası (İsteğe bağlı)
            <input
              type="tel"
              value={newStaff.phone}
              onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
              placeholder="05XX XXX XX XX"
            />
          </label>

          <label>
            Personel Rolü *
            <select
              value={newStaff.role}
              onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as any })}
            >
              <option value="sub_admin">🛡️ Yönetici (Sub-Admin)</option>
              <option value="operator">💻 Operatör (Kasa / Sipariş)</option>
              <option value="courier">🛵 Kurye (Teslimat)</option>
              <option value="owner">👑 İşletme Sahibi (Owner)</option>
            </select>
          </label>

          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold" disabled={addingStaff}>
              {addingStaff ? 'Kaydediliyor...' : 'Personeli Kaydet'}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={addingStaff}
              onClick={() => setAddStaffModal(false)}
            >
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>

      {/* ROL DEĞİŞTİR MODAL */}
      <Modal open={!!roleModalUser} onClose={() => setRoleModalUser(null)}>
        <h2>Personel Rolünü Güncelle</h2>
        <p className="muted">
          {roleModalUser?.full_name} ({roleModalUser?.email})
        </p>

        <label style={{ display: 'block', margin: '1rem 0' }}>
          Yeni Rol:
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            style={{ marginTop: '0.4rem', width: '100%' }}
          >
            <option value="sub_admin">🛡️ Yönetici (Sub-Admin)</option>
            <option value="operator">💻 Operatör (Kasa / Sipariş)</option>
            <option value="courier">🛵 Kurye</option>
            <option value="owner">👑 İşletme Sahibi (Owner)</option>
          </select>
        </label>

        <div className="prow">
          <button type="button" className="btn gold sm" onClick={handleChangeRole}>
            Rolü Ata
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setRoleModalUser(null)}>
            Vazgeç
          </button>
        </div>
      </Modal>

      {/* PERSONEL BİLGİ DÜZENLE MODAL */}
      <Modal open={!!editUser} onClose={() => !savingEdit && setEditUser(null)}>
        <h2>Personel Bilgilerini Düzenle</h2>
        <p className="muted small">
          {editUser ? ROLE_LABELS[editUser.role] || editUser.role : ''} · E-posta değişirse personel yeni e-postayla giriş yapar.
        </p>

        <form onSubmit={handleEditSubmit} className="form">
          <label>
            Ad Soyad *
            <input
              required
              value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            />
          </label>

          <label>
            E-posta (giriş için)
            <input
              type="email"
              required
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </label>

          <label>
            Telefon
            <input
              type="tel"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              placeholder="05XX XXX XX XX"
            />
          </label>

          <label>
            Yeni Şifre (değiştirmek istemiyorsanız boş bırakın)
            <input
              type="text"
              autoComplete="new-password"
              minLength={6}
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              placeholder="En az 6 karakter"
            />
          </label>

          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold" disabled={savingEdit}>
              {savingEdit ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button type="button" className="btn ghost" disabled={savingEdit} onClick={() => setEditUser(null)}>
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>

      {/* İNTERAKTİF YETKİ MATRİSİ MODALI */}
      <Modal open={!!permissionsModalUser} onClose={() => setPermissionsModalUser(null)}>
        <div style={{ maxWidth: '640px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
            <h2 style={{ fontSize: '1.3rem', margin: 0 }}>
              Yetki Yönetimi: {permissionsModalUser?.full_name}
            </h2>
            <span className="chip" style={{ fontSize: '0.8rem' }}>
              {ROLE_LABELS[permissionsModalUser?.role || ''] || permissionsModalUser?.role}
            </span>
          </div>

          {permissionsModalUser?.role === 'courier' ? (
            /* Kurye: yönetim yetkisi yok; kurye panelinin gerçek yetkileri salt okunur gösterilir */
            <>
              <p className="muted small" style={{ margin: '0 0 1rem 0' }}>
                {ROLE_DESCRIPTIONS.courier} Aşağıdakiler kurye panelinin sabit yetkileridir; açıp kapatılmaz.
              </p>
              <div style={{ maxHeight: '60vh', overflowY: 'auto', display: 'grid', gap: '0.4rem' }}>
                {COURIER_BUILTIN.map((c) => (
                  <div
                    key={c.label}
                    style={{ padding: '0.5rem 0.8rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--line)' }}
                  >
                    <b style={{ fontSize: '0.88rem' }}>✅ {c.label}</b>
                    <div className="small muted">{c.desc}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="muted small" style={{ margin: '0 0 0.4rem 0' }}>
                {ROLE_DESCRIPTIONS[permissionsModalUser?.role || ''] || ''}
              </p>
              <p className="muted small" style={{ margin: '0 0 1rem 0' }}>
                Bir yetkiye dokunduğunuzda anında kaydedilir ve personelin sonraki her işleminde geçerli olur.
                <b> Özel</b> etiketi, rolün varsayılanından farklı yapılan ayarı gösterir.
              </p>

              {/* Quick Actions */}
              {isOwner() && permissionsModalUser?.role !== 'owner' && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn gold sm"
                    style={{ fontSize: '0.78rem', padding: '0.3em 0.8em' }}
                    onClick={handleGrantAllPermissions}
                  >
                    ✓ Tüm Yetkileri Ver
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ fontSize: '0.78rem', padding: '0.3em 0.8em' }}
                    onClick={handleResetToRoleDefaults}
                  >
                    ↺ Rolün Varsayılanına Dön
                  </button>
                </div>
              )}

              {/* Grouped Permission Switches */}
              <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {Object.entries(groupedPermissions).map(([groupName, perms]) => (
                  <div key={groupName} style={{ marginBottom: '1.2rem' }}>
                    <h4
                      style={{
                        fontSize: '0.95rem',
                        color: 'var(--gold-ink)',
                        borderBottom: '1px solid var(--line)',
                        paddingBottom: '0.3rem',
                        marginBottom: '0.6rem',
                      }}
                    >
                      {groupName}
                    </h4>

                    <div style={{ display: 'grid', gap: '0.4rem' }}>
                      {perms.map((p) => {
                        const active = permissionsModalUser ? hasPermission(permissionsModalUser, p.key) : false;
                        const isSaving = savingPermission === p.key;
                        const custom =
                          !!permissionsModalUser &&
                          permissionsModalUser.role !== 'owner' &&
                          userOverrides[p.key] !== undefined &&
                          userOverrides[p.key] !== roleDefault(permissionsModalUser, p.key);
                        const desc = p.description || PERMISSION_DESCRIPTIONS[p.key] || '';

                        return (
                          <div
                            key={p.key}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '0.8rem',
                              padding: '0.5rem 0.8rem',
                              background: active ? 'var(--surface)' : 'transparent',
                              borderRadius: '8px',
                              border: '1px solid var(--line)',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            <div>
                              <b style={{ fontSize: '0.88rem' }}>{p.label}</b>
                              {custom && (
                                <span className="chip" style={{ marginLeft: '0.4rem', fontSize: '0.68rem', padding: '0 0.5em' }}>
                                  Özel
                                </span>
                              )}
                              {desc && (
                                <div className="small muted" style={{ fontSize: '0.74rem', lineHeight: 1.3, marginTop: '0.15rem' }}>
                                  {desc}
                                </div>
                              )}
                            </div>

                            <Switch
                              checked={active}
                              onChange={() => handleTogglePermission(p.key)}
                              label={active ? 'Açık' : 'Kapalı'}
                              disabled={!isOwner() || permissionsModalUser?.role === 'owner' || isSaving}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="prow" style={{ marginTop: '1.2rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn gold sm"
              onClick={() => setPermissionsModalUser(null)}
            >
              Tamam
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
