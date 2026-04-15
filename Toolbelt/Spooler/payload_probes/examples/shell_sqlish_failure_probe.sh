#!/usr/bin/env sh
set -eu

bool_flag() {
  case "${1:-false}" in
    1|true|TRUE|yes|on) echo "true" ;;
    *) echo "false" ;;
  esac
}

sql_mode="$(bool_flag "${SQL_INJECTION:-false}")"
db_engine="${DB_ENGINE:-sqlite}"
query="${QUERY_TEMPLATE:-SELECT * FROM accounts WHERE email='user@example.com'}"

printf '%s\n' "SPOOLER SHELL SQL-ISH FAILURE EXAMPLE START"
printf '%s\n' "db_engine=${db_engine}"
printf '%s\n' "sql_injection_mode=${sql_mode}"
printf '%s\n' "query_template=${query}"

contains_risky_pattern="false"
case "${query}" in
  *" OR 1=1"*|*" UNION SELECT "*|*"--"*|*"; DROP "*|*"/*"*)
    contains_risky_pattern="true"
    ;;
esac

if [ "$sql_mode" = "true" ] && [ "$contains_risky_pattern" = "true" ]; then
  printf '%s\n' "probe_step=simulated_db_failure reason=risky_sql_pattern_detected"
  printf '%s\n' "probe_result=FAIL"
  exit 1
fi

if [ "$contains_risky_pattern" = "true" ]; then
  printf '%s\n' "probe_step=sql_pattern_detected mode=guarded"
  printf '%s\n' "probe_step=simulated_sanitizer_applied"
  printf '%s\n' "probe_result=PASS guarded=true"
  exit 0
fi

printf '%s\n' "probe_result=PASS guarded=false"
exit 0
