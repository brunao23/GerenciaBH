$envPath = ".env.local"
$envLines = Get-Content $envPath
foreach ($line in $envLines) {
    if ($line -match "^NEXT_PUBLIC_SUPABASE_URL=(.*)") {
        $env:BIA_SUPABASE_URL = $matches[1].Replace("`"", "")
    }
    if ($line -match "^SUPABASE_SERVICE_ROLE_KEY=(.*)") {
        $env:BIA_SUPABASE_SERVICE_ROLE_KEY = $matches[1].Replace("`"", "")
    }
}
npx tsx query_logs.ts
