// supabase.rpc taklidi: testler globalThis.__rpc ile davranışı belirler
export const supabase = { rpc: (name, args) => globalThis.__rpc(name, args) };
