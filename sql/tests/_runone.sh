#!/bin/bash
# tek test: tests/_runone.sh tests/10_customers.test.sql  (yz veritabanı hazır olmalı)
cd "$(dirname "$0")/.."; psql -X -q -d "${VERIFY_DB:-yz}" -v ON_ERROR_STOP=1 -f "$1" 2>&1 | grep -v "^$"
