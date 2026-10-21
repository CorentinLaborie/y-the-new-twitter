# Lance les tests end-to-end de Y sous Windows (PowerShell 5.1).
#
# Etape 1 : tests mockes (tous les e2e/*.spec.ts sauf real-api.spec.ts), sur les projets desktop, tablet, mobile,
#           avec Google Chrome installe (aucun navigateur telecharge).
# Etape 2 : tests contre la vraie API (real-api.spec.ts) : backend compile et lance sur le port 8080,
#           base de test y_e2e.
#
# Usage :  powershell -ExecutionPolicy Bypass -File scripts\run-e2e.ps1
# Options : -SkipRealApi  (etape 1 seulement)
#           -DryRun       (affiche les commandes sans les lancer)

param(
    [switch]$SkipRealApi,
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

$repoRoot    = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $repoRoot 'frontend'
$backendDir  = Join-Path $repoRoot 'backend'
$backendEnv  = Join-Path $backendDir '.env'
$lockPath    = Join-Path $env:TEMP 'y-e2e.lock'
$configPath  = Join-Path $env:TEMP 'y-e2e-playwright.config.ts'
$resultsDir  = Join-Path $env:TEMP 'y-e2e-results'
$stamp       = Get-Date -Format 'yyyyMMdd-HHmmss'
$logStep1    = Join-Path $env:TEMP "y-e2e-step1-$stamp.log"
$logStep2    = Join-Path $env:TEMP "y-e2e-step2-$stamp.log"
$logBackend  = Join-Path $env:TEMP "y-e2e-backend-$stamp.log"
$logBackErr  = Join-Path $env:TEMP "y-e2e-backend-$stamp.err.log"
$dbCheckPath = Join-Path $env:TEMP "y-e2e-check-db-$stamp.js"
$e2eDatabase = 'y_e2e'
$lockCreated = $false
$backendProc = $null
$envKeysSet  = @()
$exitCode    = 0

function Write-Step([string]$text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }
function Write-Cmd([string]$dir, [string]$text) {
    Write-Host "   dossier : $dir"
    Write-Host "   commande: $text"
}

# Renvoie la liste des PID qui ecoutent sur un port TCP (netstat, lecture seule).
function Get-ListeningPids([int]$port) {
    $found = @()
    foreach ($line in (netstat.exe -ano -p TCP)) {
        if ($line -match "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
            $found += [int]$Matches[1]
        }
    }
    return ,$found
}

function Assert-PortFree([int]$port) {
    $owners = Get-ListeningPids $port
    if ($owners.Count -gt 0) {
        $details = foreach ($p in ($owners | Select-Object -Unique)) {
            $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
            $name = if ($proc) { $proc.ProcessName } else { 'inconnu' }
            "PID $p ($name)"
        }
        throw "Le port $port est deja occupe par : $($details -join ', '). Arretez ce processus avant de lancer les e2e."
    }
}

# Lit backend/.env (lignes KEY=VALUE, guillemets retires) et reecrit la base vers y_e2e.
function Read-BackendEnv {
    if (-not (Test-Path -LiteralPath $backendEnv)) {
        throw "Fichier introuvable : $backendEnv. Copiez .env.example vers backend/.env (valeurs locales) avant l'etape 2."
    }
    $values = [ordered]@{}
    foreach ($raw in (Get-Content -LiteralPath $backendEnv -Encoding UTF8)) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $values[$Matches[1]] = $value
        }
    }
    foreach ($key in @('DATABASE_URL', 'DATABASE_MAINTENANCE_URL')) {
        if ($values.Contains($key) -and $values[$key] -ne '') {
            # Remplace le nom de la base (le segment apres le dernier / avant la query string) par y_e2e.
            $values[$key] = [regex]::Replace($values[$key], '^(postgres(?:ql)?://[^?]*/)[^/?]+', "`${1}$e2eDatabase")
        }
    }
    if (-not $values.Contains('DATABASE_URL') -or $values['DATABASE_URL'] -eq '') {
        throw "DATABASE_URL absent de backend/.env."
    }
    return $values
}

# Verifie que y_e2e existe, est migree et seme. Codes de sortie : 0 ok, 2 connexion, 3 pg absent, 4 migrations, 5 seed.
function Test-E2eDatabase($values, [string]$nodePath) {
    $js = @'
const dir = process.env.Y_E2E_BACKEND_DIR;
let pg;
try { pg = require(require.resolve('pg', { paths: [dir] })); } catch (e) { console.log('PG_ABSENT'); process.exit(3); }
const client = new pg.Client({ connectionString: process.env.Y_E2E_DATABASE_URL });
(async () => {
  try { await client.connect(); }
  catch (e) { console.log(e.code === '3D000' ? 'BASE_ABSENTE' : 'CONNEXION_KO ' + (e.code || '')); process.exit(2); }
  try {
    const t = await client.query("select to_regclass('public._prisma_migrations') is not null as ok");
    if (!t.rows[0].ok) { console.log('NON_MIGREE'); process.exit(4); }
    const m = await client.query('select count(*)::int as n from _prisma_migrations where finished_at is not null');
    if (m.rows[0].n === 0) { console.log('NON_MIGREE'); process.exit(4); }
    const s = await client.query("select count(*)::int as n from users where handle = 'demo_alice'");
    if (s.rows[0].n === 0) { console.log('NON_SEMEE'); process.exit(5); }
    console.log('OK');
  } catch (e) { console.log('VERIFICATION_KO ' + (e.code || '')); process.exit(6); }
  finally { await client.end().catch(() => {}); }
})();
'@
    if ($DryRun) {
        Write-Cmd $backendDir "node <verification de $e2eDatabase via le paquet pg>"
        Write-Host "   [DRY-RUN] non execute"
        return
    }
    Set-Content -LiteralPath $dbCheckPath -Value $js -Encoding ASCII
    $env:Y_E2E_BACKEND_DIR = $backendDir
    $env:Y_E2E_DATABASE_URL = $values['DATABASE_URL']
    try {
        Push-Location $backendDir
        $out = & $nodePath $dbCheckPath
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
        Remove-Item Env:Y_E2E_BACKEND_DIR, Env:Y_E2E_DATABASE_URL -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $dbCheckPath -ErrorAction SilentlyContinue
    }
    if ($code -eq 0) { Write-Host "   Base $e2eDatabase : migree et semee."; return }
    $setup = @(
        "   Mise en place (une seule fois, Docker Desktop lance) :",
        "     1. Creer la base :",
        "        docker compose exec postgres psql -U y -c `"CREATE DATABASE y_e2e;`"",
        "     2. Appliquer les migrations (dans backend/, avec DATABASE_URL pointant sur y_e2e) :",
        "        npx prisma migrate deploy",
        "     3. Compiler puis semer les donnees fictives :",
        "        npm run build",
        "        node dist/database/seed.js",
        "     4. Mot de passe de demo_alice : le seed ecrit le hash de test 'seed-placeholder-not-a-password-hash',",
        "        qui ne correspond a aucun mot de passe (voir backend/src/database/seed.ts)."
    )
    switch ($code) {
        2 { $why = "Connexion a PostgreSQL impossible (conteneur Docker arrete ? port 5434 ?)" }
        3 { $why = "Le paquet pg est introuvable : lancez npm install dans backend/." }
        4 { $why = "La base $e2eDatabase n'est pas migree (ou n'existe pas)." }
        5 { $why = "La base $e2eDatabase n'est pas semee (demo_alice absent)." }
        default { $why = "Verification de la base impossible (code $code)." }
    }
    throw ("$why`n" + ($setup -join "`n"))
}

function Get-PlaywrightSummary([string]$log) {
    $summary = @{}
    if (-not (Test-Path -LiteralPath $log)) { return $summary }
    $text = Get-Content -LiteralPath $log -Raw
    foreach ($key in @('passed', 'failed', 'skipped', 'flaky')) {
        $matches2 = [regex]::Matches($text, "(?m)^\s+(\d+) $key\b")
        if ($matches2.Count -gt 0) { $summary[$key] = [int]$matches2[$matches2.Count - 1].Groups[1].Value }
        else { $summary[$key] = 0 }
    }
    return $summary
}

# Lance npx playwright test avec sortie journalisee. Renvoie le code de sortie.
function Invoke-Playwright([string]$label, [string[]]$arguments, [string]$log, [string]$npxPath) {
    Write-Step $label
    $shown = 'npx playwright test ' + ($arguments -join ' ')
    Write-Cmd $frontendDir $shown
    Write-Host "   journal : $log"
    if ($DryRun) { Write-Host '   [DRY-RUN] non execute'; return 0 }
    Push-Location $frontendDir
    try {
        & $npxPath playwright test @arguments 2>&1 | Tee-Object -FilePath $log | Out-Host
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    $s = Get-PlaywrightSummary $log
    Write-Host ("   Resume : {0} passes, {1} echoues, {2} ignores, {3} instables" -f $s['passed'], $s['failed'], $s['skipped'], $s['flaky'])
    if ($code -ne 0) { Write-Host "   Code de sortie Playwright : $code" -ForegroundColor Yellow }
    return $code
}

try {
    Write-Host 'Tests end-to-end Y (Windows)' -ForegroundColor Green
    if ($DryRun) { Write-Host '[DRY-RUN] aucune commande ne sera lancee, aucun fichier ecrit.' -ForegroundColor Yellow }

    # Outils
    $npxPath  = (Get-Command 'npx.cmd' -ErrorAction SilentlyContinue).Source
    $npmPath  = (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue).Source
    $nodePath = (Get-Command 'node.exe' -ErrorAction SilentlyContinue).Source
    if (-not $npxPath -or -not $npmPath -or -not $nodePath) {
        throw 'Node.js, npm ou npx introuvable dans le PATH.'
    }

    # Google Chrome (canal chrome de Playwright, aucun navigateur telecharge)
    $chromeCandidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
    if (-not ($chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)) {
        throw 'Google Chrome n''est pas installe (chemins standards verifies). Installez Chrome, puis relancez.'
    }

    # Une seule execution a la fois : ports puis verrou
    Write-Step 'Verification des ports 8080 et 3000'
    Assert-PortFree 8080
    Assert-PortFree 3000
    Write-Host '   Ports 8080 et 3000 libres.'

    if (Test-Path -LiteralPath $lockPath) {
        $holder = Get-Content -LiteralPath $lockPath -ErrorAction SilentlyContinue
        throw "Un autre run e2e est en cours ou a echoue sans nettoyer ($lockPath : $holder). Si aucun run n'est actif, supprimez ce fichier."
    }

    # Base de test et .env : verifies au debut, avant tout test
    $dbValues = $null
    if (-not $SkipRealApi) {
        Write-Step "Verification de la base $e2eDatabase et de backend/.env"
        if ($DryRun -and -not (Test-Path -LiteralPath $backendEnv)) {
            Write-Host "   [DRY-RUN] backend/.env absent : la lecture est simulee."
            $dbValues = @{ 'DATABASE_URL' = 'postgresql://<utilisateur>:<mot-de-passe>@localhost:5434/y_e2e' }
        } else {
            $dbValues = Read-BackendEnv
        }
        Test-E2eDatabase $dbValues $nodePath
    }

    if (-not $DryRun) {
        New-Item -ItemType File -Path $lockPath -ErrorAction Stop | Out-Null
        $lockCreated = $true
        Set-Content -LiteralPath $lockPath -Value "PID $PID $(Get-Date -Format s)" -Encoding ASCII
    } else {
        Write-Host "[DRY-RUN] verrou : $lockPath (non cree)"
    }

    # Config Playwright temporaire (hors du depot) : meme config, canal chrome, webServer lance dans frontend/
    $fwd = { param($p) $p -replace '\\', '/' }
    $configText = @"
// Genere par scripts/run-e2e.ps1 dans le dossier temporaire. Ne pas editer, ne pas committer.
import base from '$(& $fwd (Join-Path $frontendDir 'playwright.config'))';

const frontendDir = '$(& $fwd $frontendDir)';

export default {
  ...base,
  testDir: '$(& $fwd (Join-Path $frontendDir 'e2e'))',
  outputDir: '$(& $fwd $resultsDir)',
  projects: base.projects.map((project) => ({ ...project, use: { ...project.use, channel: 'chrome' } })),
  webServer: base.webServer.map((server) => ({ ...server, cwd: frontendDir })),
};
"@
    Write-Step 'Configuration Playwright temporaire'
    Write-Host "   fichier : $configPath"
    if ($DryRun) {
        Write-Host '   [DRY-RUN] non ecrit'
    } else {
        Set-Content -LiteralPath $configPath -Value $configText -Encoding ASCII
    }

    # Etape 1 : tests mockes
    $mockedSpecs = Get-ChildItem -LiteralPath (Join-Path $frontendDir 'e2e') -Filter '*.spec.ts' |
        Where-Object { $_.Name -ne 'real-api.spec.ts' } |
        ForEach-Object { 'e2e/' + $_.Name }
    $step1Args = @('--config', $configPath) + $mockedSpecs
    $code1 = Invoke-Playwright 'Etape 1 : tests mockes (desktop, tablet, mobile)' $step1Args $logStep1 $npxPath
    if ($code1 -ne 0) { $exitCode = 1 }

    if ($SkipRealApi) {
        Write-Host ''
        Write-Host 'Etape 2 ignoree (-SkipRealApi).'
    } else {
        # Etape 2 : backend reel
        Write-Step 'Etape 2 : compilation du backend'
        Write-Cmd $backendDir 'npm run build'
        if (-not $DryRun) {
            Push-Location $backendDir
            try { & $npmPath run build 2>&1 | Out-Host; $buildCode = $LASTEXITCODE } finally { Pop-Location }
            if ($buildCode -ne 0) { throw "Echec de la compilation du backend (code $buildCode)." }
        } else { Write-Host '   [DRY-RUN] non execute' }

        Write-Step "Etape 2 : demarrage du backend sur la base $e2eDatabase"
        Write-Cmd $backendDir 'node dist/main.js (variables de backend/.env, DATABASE_URL et DATABASE_MAINTENANCE_URL vers y_e2e)'
        if ($DryRun) {
            Write-Host '   [DRY-RUN] non execute'
            Write-Host '   Attente de http://localhost:8080/health (200), jusqu a 60 secondes.'
        } else {
            foreach ($key in $dbValues.Keys) {
                Set-Item -Path "Env:$key" -Value $dbValues[$key]
                $envKeysSet += $key
            }
            $backendProc = Start-Process -FilePath $nodePath -ArgumentList 'dist/main.js' -WorkingDirectory $backendDir `
                -PassThru -WindowStyle Hidden -RedirectStandardOutput $logBackend -RedirectStandardError $logBackErr
            Write-Host "   PID du backend : $($backendProc.Id)"

            Write-Host '   Attente de http://localhost:8080/health ...'
            $healthy = $false
            for ($i = 0; $i -lt 60; $i++) {
                if ($backendProc.HasExited) { break }
                try {
                    $resp = Invoke-WebRequest -Uri 'http://localhost:8080/health' -UseBasicParsing -TimeoutSec 3
                    if ($resp.StatusCode -eq 200) { $healthy = $true; break }
                } catch { }
                Start-Sleep -Seconds 1
            }
            if (-not $healthy) {
                throw "Le backend ne repond pas 200 sur /health. Journal : $logBackend et $logBackErr."
            }
            Write-Host '   Backend pret (200).'
        }

        $args2 = @('--config', $configPath, 'e2e/real-api.spec.ts')
        $code2 = Invoke-Playwright 'Etape 2 : tests contre la vraie API (real-api.spec.ts)' $args2 $logStep2 $npxPath
        if ($code2 -ne 0) { $exitCode = 1 }
    }
}
catch {
    Write-Host ''
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
}
finally {
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "Backend arrete (PID $($backendProc.Id))."
    }
    foreach ($key in $envKeysSet) { Remove-Item -Path "Env:$key" -ErrorAction SilentlyContinue }
    if (-not $DryRun -and (Test-Path -LiteralPath $configPath)) { Remove-Item -LiteralPath $configPath -ErrorAction SilentlyContinue }

    if (-not $DryRun -and $backendProc) {
        Start-Sleep -Seconds 2
        foreach ($port in @(8080, 3000)) {
            $owners = Get-ListeningPids $port
            if ($owners.Count -gt 0) {
                Write-Host "ATTENTION : le port $port est encore occupe (PID $($owners -join ', ')) apres l'arret." -ForegroundColor Yellow
                $exitCode = 1
            }
        }
    }
    if ($lockCreated) { Remove-Item -LiteralPath $lockPath -ErrorAction SilentlyContinue }
}

Write-Host ''
if ($exitCode -eq 0) { Write-Host 'Resultat : succes.' -ForegroundColor Green }
else { Write-Host 'Resultat : echec (voir les journaux dans $env:TEMP).' -ForegroundColor Red }
exit $exitCode
