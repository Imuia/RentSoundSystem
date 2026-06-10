# Téléchargement automatique des logos RentSoundSystem
# A lancer dans le terminal Antigravity, à la racine du projet

$ErrorActionPreference = "Continue"
$destination = Join-Path (Get-Location) "public\uploads\abouts"
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$urls = @(
    "https://rentsoundsystem.com/uploads/abouts/2a008490b4f2acc1edc33e2a77f28959.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/0e36166fc1f10c622872bd0c8d1e2df5.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/ea7d8d6d18b807600524601b2103df28.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/341567417f23f9676c129d25417e5219.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/3f53b9984fe58f1b40046d0c8d692477.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/b605234db1c36781df54c7a67f997cea.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/64aa5b4401dff750cc53a11a3b54ef47.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/4b4b4ec5e5440489167f58f93af6e306.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/7482f8be2c2fe9c92516b40009e4df35.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/01e2b6d36ef6ba5c5cef70d08adaced5.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/cbbe784bbfc0b51b6a2e74ba80019ed4.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/112dfe5bc7db0ea4e241cb465ba2c9db.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/c705e199f07cebb1be7dd96d5642580e.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/7e1a369f4b1ed082ab8325664581b7fe.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/5dd510131054077766ecd9848eab74bd.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/e34efb75022a7b9040cd799481fea1dc.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/35289100ccb8604e96503349ccc6c6e9.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/257f31a62e1d0628a22384455637b581.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/ad78adeb91ca7046be327793c4bbc688.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/d1216f7e5d11d3d05c9da8c4f3d79cd0.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/7527f1987da4a30513b927ab4479358c.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/e47a85fc3c20c18e368ec190f5d18b6c.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/52f1d33b062d32a767d96d47bd4c5014.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/3523eadf2220864d8b9133794bbf8bac.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/52a073da02ce9606c51ba77d364a6f3c.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/f3996d91d14c53622ababa3c7e650f58.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/30d142f89547a5906a872ff0bba6fe3a.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/5deac6eae43f029d0a4211ef0f66ed89.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/3854c339995b78ef94a090a36855ec79.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/6b90ab6f709df9321d47ec8d3a05b264.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/884172cb553617459699ae48ba248dd9.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/17e06cd32e632cbaf3a86c3985573c6f.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/73e020376093d7be38fd2e80e35089e8.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/94d8eb45903ff54f27d17eab831f27aa.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/d274f4615a30232f1c7c019ad2edd22f.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/d49ac7c44e6b90ecf0e65c42d6e3ee10.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/7035555bdf08e90253e0dc29f06c2b8f.png"
    "https://rentsoundsystem.com/uploads/abouts/f881cc1f39f46683ab3e6e2355685be8.png"
    "https://rentsoundsystem.com/uploads/abouts/8340da60799d7192c0b624d3e30fe4e2.png"
    "https://rentsoundsystem.com/uploads/abouts/0ed94786d81e4b4595f2538d0fb1e094.png"
    "https://rentsoundsystem.com/uploads/abouts/18c3fda84c8dcca5476374116d22898e.png"
    "https://rentsoundsystem.com/uploads/abouts/b88340dd813901559257358119fab9fa.png"
    "https://rentsoundsystem.com/uploads/abouts/a4aa412dfe50795167d82996bbd5afb7.png"
    "https://rentsoundsystem.com/uploads/abouts/65085b845576e0a1748c625f487c2b27.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/13aa69de66f36ac6ecd1d42bc2d6ae13.png"
    "https://rentsoundsystem.com/uploads/abouts/10d893ab498f8eaf16ccdacdf46036dc.png"
    "https://rentsoundsystem.com/uploads/abouts/7d96d5e3b164a684d75b420071b47dc1.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/d40ed32bfa4a3d8be6e590f984c35af8.bin"
    "https://rentsoundsystem.com/uploads/abouts/a16bf6e9aa8ad09993fc2d01a8c79e5f.svg"
    "https://rentsoundsystem.com/uploads/abouts/2768c2f4fc18f8f260a859440d10728c.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/e790c7029a2199609b0aa6ca40c2cc01.svg"
    "https://rentsoundsystem.com/uploads/abouts/ef04e5eaec3c1f6cce8bed3e2dc2e3ec.svg"
    "https://rentsoundsystem.com/uploads/abouts/2d09192b9d41533493f1e6160f94f943.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/1b8e2642e6e599cb4fc3af9a0dd1d23b.svg"
    "https://rentsoundsystem.com/uploads/abouts/96e380c7319e06cdf920fe9129048523.svg"
    "https://rentsoundsystem.com/uploads/abouts/b9a89ba70c40e1ad86ebcf2457a10949.svg"
    "https://rentsoundsystem.com/uploads/abouts/e650eb3da305c453ced6cafdef067352.svg"
    "https://rentsoundsystem.com/uploads/abouts/1842a5d79ec42dfbb6280f3e1f07fe19.svg"
    "https://rentsoundsystem.com/uploads/abouts/fdaf3f12554debdbcea751a3ca230150.svg"
    "https://rentsoundsystem.com/uploads/abouts/40fa3eb117a5a2aa5c327d93942f379e.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/67fe7286cb8f3df49cb0fd7596cf35ba.svg"
    "https://rentsoundsystem.com/uploads/abouts/54776e6c446db3ccae8d6e731c14efa7.svg"
    "https://rentsoundsystem.com/uploads/abouts/0d5474c7a209ec7efcef1a9a6a1722b4.svg"
    "https://rentsoundsystem.com/uploads/abouts/2fde2e2b6976f60f80702b718827b8fc.png"
    "https://rentsoundsystem.com/uploads/abouts/b78a9f085f63a257723252d479ecd3ff.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/f0071431f244290aed33f401a5dd5be8.png"
    "https://rentsoundsystem.com/uploads/abouts/d9838a3e114082575d64b395990cf05c.bin"
    "https://rentsoundsystem.com/uploads/abouts/1f26a23ee2ef7f22c10857a4f53e0d64.bin"
    "https://rentsoundsystem.com/uploads/abouts/f172c4b0a4ed4fb72e605063201566ac.bin"
    "https://rentsoundsystem.com/uploads/abouts/27ff6b08cf6b1e54fecd88e78e2ef8b4.png"
    "https://rentsoundsystem.com/uploads/abouts/d55f7323d76310cf018b8c18ff84c6e1.png"
    "https://rentsoundsystem.com/uploads/abouts/6482631f17d4df069bc14c14fed4450e.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/0a0cad1c9fa611cd82e26ae51934c5e5.png"
    "https://rentsoundsystem.com/uploads/abouts/658e72ed79b10c87d256833949fd9975.png"
    "https://rentsoundsystem.com/uploads/abouts/993886c91e4145d33e4f098b3826fc87.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/9b036ea28d85c1381a7867543eed7c3a.png"
    "https://rentsoundsystem.com/uploads/abouts/e32d5c23d0565c046677370bf0ca34a3.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/c5a40b9568c591dc7ed17c29938d59db.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/64a1a247aa891a0b5fd76aed9852f033.png"
    "https://rentsoundsystem.com/uploads/abouts/1b979f8933d487de2cb69615f89378cc.png"
    "https://rentsoundsystem.com/uploads/abouts/210fea88a06bde842cb941233eb9a80c.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/bd1f1141cc97c99fee02aba7d32b2984.png"
    "https://rentsoundsystem.com/uploads/abouts/46f2de411cc1a840249e1cdd028b9050.png"
    "https://rentsoundsystem.com/uploads/abouts/e8a89bbc526715428402b594527ea87e.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/2612e787426b2ec95bc7dadff1b68a6e.png"
    "https://rentsoundsystem.com/uploads/abouts/127063eafa748b4f96966aee052ae348.png"
    "https://rentsoundsystem.com/uploads/abouts/39e2a50a4d7aa8cc80af1ba7ed3337a3.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/047fb3bf04d537e9e9a5770db82f57c3.png"
    "https://rentsoundsystem.com/uploads/abouts/abbe40b54c6d30a5355b8caad1de65b7.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/6843d391af27d59b5f271209b5fc1494.png"
    "https://rentsoundsystem.com/uploads/abouts/9c508129a3acaabbe00b20b44529c113.png"
    "https://rentsoundsystem.com/uploads/abouts/55dd86e6c6dd50ae2e208c555b9d8936.png"
    "https://rentsoundsystem.com/uploads/abouts/46670b97be45fd9f61c69fcfb7a739ef.png"
    "https://rentsoundsystem.com/uploads/abouts/4aa3289a135c6ef7cdee36bab89854bc.png"
    "https://rentsoundsystem.com/uploads/abouts/a2a56fa96bfd1414859bc9427fcceadb.png"
    "https://rentsoundsystem.com/uploads/abouts/a7d791e7771fb670e81c8890482bb408.jpeg"
    "https://rentsoundsystem.com/uploads/abouts/f9711e21f4de94130562e49a4cdef918.png"
    "https://rentsoundsystem.com/uploads/abouts/563ccc2c5137cc17c403d222b001fc43.jpeg"
)

Write-Host "Téléchargement de $($urls.Count) logos vers $destination" -ForegroundColor Cyan

$ok = 0
$fail = 0
foreach ($url in $urls) {
    $file = Split-Path $url -Leaf
    $out = Join-Path $destination $file
    if (Test-Path $out) {
        Write-Host "Déjà présent: $file" -ForegroundColor DarkGray
        $ok++
        continue
    }
    try {
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
        Write-Host "OK: $file" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "ERREUR: $file => $url" -ForegroundColor Red
        $fail++
    }
}

Write-Host "Terminé. OK: $ok / Erreurs: $fail" -ForegroundColor Yellow
