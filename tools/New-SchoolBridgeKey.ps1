$bridgeBytes = New-Object byte[] 32
$bridgeRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bridgeRng.GetBytes($bridgeBytes)
$bridgeRng.Dispose()

$bridgeSecret = [Convert]::ToBase64String($bridgeBytes)
$bridgeSecret
Set-Clipboard -Value $bridgeSecret
