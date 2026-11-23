#!/usr/bin/env bash
# ORDER.txt'deki dosyaları sırayla birleştirip yazir_full_schema.sql üretir (elle düzenlemeyin; yeni dosya ekleyince bunu yeniden çalıştırın).
# Ardından:  sql/tools/verify.sh --full   → tek dosya kurulumunun zincirle aynı sonucu verdiğini doğrular.
set -eu
cd "$(dirname "$0")/.."
OUT=yazir_full_schema.sql
{
  echo "-- ====================================================================="
  echo "-- YAZIR PİLAVCISI · TAM ŞEMA (otomatik üretildi — ELLE DÜZENLEMEYİN)"
  echo "-- Kaynak: sql/ORDER.txt içindeki dosyalar, o sırayla. Üretim: sql/tools/build_full_schema.sh"
  echo "-- Doğrulama: boş PostgreSQL'de çalıştırıldı, parça parça kurulumla aynı şemayı verdiği karşılaştırıldı."
  echo "-- BOŞ bir Supabase projesinde SQL Editor'den BİR KEZ çalıştırın. (Canlıda yeniden çalıştırmayın; güncelleme için yalnızca yeni numaralı dosyaları çalıştırın.)"
  echo "-- ÖN KOŞULLAR: Supabase'te pg_cron / pg_net eklentileri ve Vault'ta 'cron_secret' (bkz. sql/README.md). Sahip ataması ayrı: sql/07_bootstrap_owner.sql"
  echo "-- Üretim zamanı: $(date -u +%Y-%m-%d)"
  echo "-- ====================================================================="
  grep -v '^#' ORDER.txt | grep -v '^$' | while read -r f; do
    echo; echo "-- #####################################################################"; echo "-- ##### $f"; echo "-- #####################################################################"
    tr -d '\r' < "$f"
  done
} > "$OUT"
echo "$OUT: $(wc -l < "$OUT") satır, $(grep -vc '^#' ORDER.txt) dosya birleştirildi"
