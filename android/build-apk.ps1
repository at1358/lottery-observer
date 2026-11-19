param(
 [Parameter(Mandatory=$true)][string]$JavaHome,
 [Parameter(Mandatory=$true)][string]$SdkRoot,
 [string]$UnsignedApk,
 [string]$SigningConfig,
 [switch]$CreateSigningKey
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(-not $SigningConfig){$SigningConfig=Join-Path $projectRoot 'outputs/android-signing/signing.json'}
$javaDirectory=(Resolve-Path -LiteralPath $JavaHome).Path
$sdkDirectory=(Resolve-Path -LiteralPath $SdkRoot).Path
$javaTool=Join-Path $javaDirectory 'bin/java.exe'
$keyTool=Join-Path $javaDirectory 'bin/keytool.exe'
if(-not (Test-Path -LiteralPath $javaTool)){throw 'Java JDK 路径不正确'}
$privateDirectory=Split-Path -Parent ([IO.Path]::GetFullPath($SigningConfig))
if(-not (Test-Path -LiteralPath $SigningConfig)){
 if(-not $CreateSigningKey){throw '缺少正式签名配置。首次构建可使用 -CreateSigningKey；以后请复用原签名。'}
 New-Item -ItemType Directory -Force -Path $privateDirectory | Out-Null
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 $acl=[Security.AccessControl.DirectorySecurity]::new()
 $acl.SetOwner($identity.User);$acl.SetAccessRuleProtection($true,$false)
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity.User,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
 Set-Acl -LiteralPath $privateDirectory -AclObject $acl
 $signingPath=Join-Path $privateDirectory 'period-observer-release.jks'
 if(Test-Path -LiteralPath $signingPath){throw '已存在签名文件，请恢复与其匹配的配置，不能覆盖旧签名。'}
 $password=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36))
 $env:OBSERVER_KEYTOOL_PASSWORD=$password
 try{
  & $keyTool -genkeypair -keystore $signingPath -storetype JKS -alias period-observer -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Period Observer, OU=Development, O=AIFX, C=CN' -storepass:env OBSERVER_KEYTOOL_PASSWORD -keypass:env OBSERVER_KEYTOOL_PASSWORD *> (Join-Path $privateDirectory 'key-generation.log')
  if($LASTEXITCODE -ne 0){throw '创建应用签名失败，请检查本地签名日志。'}
  @{storeFile=$signingPath;storePassword=$password;keyAlias='period-observer';keyPassword=$password} | ConvertTo-Json | Set-Content -LiteralPath $SigningConfig -Encoding utf8
 }finally{Remove-Item Env:OBSERVER_KEYTOOL_PASSWORD -ErrorAction SilentlyContinue}
}
$signing=Get-Content -LiteralPath $SigningConfig -Raw | ConvertFrom-Json
if(-not(Test-Path -LiteralPath $signing.storeFile)){throw '找不到原正式签名文件，请恢复备份。'}
$env:JAVA_HOME=$javaDirectory;$env:ANDROID_HOME=$sdkDirectory;$env:ANDROID_SDK_ROOT=$sdkDirectory
$env:OBSERVER_ANDROID_STORE_FILE=$signing.storeFile
$env:OBSERVER_ANDROID_STORE_PASSWORD=$signing.storePassword
$env:OBSERVER_ANDROID_KEY_ALIAS=$signing.keyAlias
$env:OBSERVER_ANDROID_KEY_PASSWORD=$signing.keyPassword
Push-Location $PSScriptRoot
try{
 $verifier=Get-ChildItem -LiteralPath (Join-Path $sdkDirectory 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
 if($UnsignedApk){
  $inputApk=(Resolve-Path -LiteralPath $UnsignedApk).Path
  $signingWork=Join-Path $projectRoot 'outputs/android-signing-work'
  New-Item -ItemType Directory -Force -Path $signingWork | Out-Null
  $aligned=Join-Path $signingWork 'aligned.apk';$apk=Join-Path $signingWork 'signed.apk'
  & (Join-Path $verifier.FullName 'zipalign.exe') -f 4 $inputApk $aligned
  if($LASTEXITCODE -ne 0){throw 'APK 对齐失败。'}
  & (Join-Path $verifier.FullName 'apksigner.bat') sign --ks $signing.storeFile --ks-key-alias $signing.keyAlias --ks-pass env:OBSERVER_ANDROID_STORE_PASSWORD --key-pass env:OBSERVER_ANDROID_KEY_PASSWORD --out $apk $aligned
  if($LASTEXITCODE -ne 0){throw '正式 APK 签名失败。'}
 }else{
  & "$PSScriptRoot/gradlew.bat" --no-daemon --console=plain --max-workers=2 --gradle-user-home "$projectRoot/outputs/android-gradle-cache" testDebugUnitTest lintRelease assembleRelease
  if($LASTEXITCODE -ne 0){throw '安卓编译或检查失败。'}
  $apk=Join-Path $PSScriptRoot 'app/build/outputs/apk/release/app-release.apk'
 }
 & (Join-Path $verifier.FullName 'apksigner.bat') verify --verbose --print-certs $apk
 if($LASTEXITCODE -ne 0){throw 'APK 签名验证失败。'}
 $outputDirectory=Join-Path $projectRoot 'outputs/android-release'
 New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
 $version=(Select-String -LiteralPath "$PSScriptRoot/app/build.gradle" -Pattern "versionName '([^']+)'" ).Matches[0].Groups[1].Value
 $output=Join-Path $outputDirectory "PeriodObserver-$version.apk"
 Copy-Item -LiteralPath $apk -Destination $output -Force
 $digest=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
 "$digest  PeriodObserver-$version.apk" | Set-Content -LiteralPath "$output.sha256" -Encoding ascii
 Write-Output "APK_READY $output"
 Write-Output "SHA256 $digest"
 Write-Output "正式签名备份目录：$privateDirectory（不要提交到 GitHub 或上传网站）"
}finally{
 Pop-Location
 foreach($variable in @('OBSERVER_ANDROID_STORE_FILE','OBSERVER_ANDROID_STORE_PASSWORD','OBSERVER_ANDROID_KEY_ALIAS','OBSERVER_ANDROID_KEY_PASSWORD')){Remove-Item "Env:$variable" -ErrorAction SilentlyContinue}
}
