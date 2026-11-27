#!/usr/bin/env bash
# Boş bir PostgreSQL'de TÜM kurulumu sırayla çalıştırır, hataları listeler ve testleri koşar.
# Kullanım (sunucu ve psql kurulu olmalı):   PGHOST=... PGPORT=... PGUSER=postgres sql/tools/verify.sh [--full]
#   --full : ORDER.txt yerine yazir_full_schema.sql'i çalıştırır (tek dosya kurulumunu doğrular)
# Gerçek Supabase projesinde ÇALIŞTIRMAYIN; geçici "yz_verify" veritabanını açıp siler.
set -u
cd "$(dirname "$0")/.."
DB=${VERIFY_DB:-yz_verify}
PSQL="psql -X -q -v ON_ERROR_STOP=0"
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
$PSQL -d "$DB" -c "alter database $DB set search_path = \"\$user\", public, extensions" >/dev/null 2>&1
$PSQL -d "$DB" -f tools/supabase_stub.sql >/dev/null 2>&1
# Yalnızca bu taklit ortamda görülen, GERÇEK Supabase'te sorun olmayan hatalar
KNOWN='extension "pg_cron" is not available|extension "pg_net" is not available'
bad=0
run() {
  local f=$1 out
  out=$($PSQL -d "$DB" -f "$f" 2>&1 >/dev/null | grep -E "ERROR|FATAL" | grep -Ev "$KNOWN")
  if [ -n "$out" ]; then echo "✗ $f"; echo "$out" | head -5 | sed 's/^/    /'; bad=$((bad+1)); else echo "✓ $f"; fi
}
if [ "${1:-}" = "--full" ]; then run yazir_full_schema.sql
else grep -v '^#' ORDER.txt | grep -v '^$' | while read -r f; do run "$f"; done | tee /tmp/yz_verify_out.txt; bad=$(grep -c '^✗' /tmp/yz_verify_out.txt); fi
echo "--- Kurulum: $bad dosyada hata"
tbad=0
for t in tests/*.test.sql; do
  [ -e "$t" ] || continue
  res=$($PSQL -d "$DB" -v ON_ERROR_STOP=1 -f "$t" 2>&1 | grep -E "ERROR|TEST_FAIL" | head -3)
  if [ -n "$res" ]; then echo "✗ test $t"; echo "$res" | sed 's/^/    /'; tbad=$((tbad+1)); else echo "✓ test $t"; fi
done
echo "--- Testler: $tbad başarısız"
$PSQL -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
[ "$bad" -eq 0 ] && [ "$tbad" -eq 0 ]
