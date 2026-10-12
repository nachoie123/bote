#!/bin/zsh
# Capturas de la App Store con la partida de ejemplo (Demo.swift). Deja 5 PNG de 1206×2622 en capturas/63/.
#   cd apple && ./capturas.sh
set -e
U=$(xcrun simctl list devices available | grep "iPhone 17 Pro Max" | grep -o "[0-9A-F-]\{36\}" | head -1)
xcrun simctl boot "$U" 2>/dev/null || true
xcrun simctl status_bar "$U" override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcodebuild -project Bote.xcodeproj -scheme Bote-iOS -configuration Debug -destination "platform=iOS Simulator,id=$U" -derivedDataPath build/ios build | grep -E "^\*\*"
xcrun simctl install "$U" build/ios/Build/Products/Debug-iphonesimulator/Bote.app
for e in inicio partida reparto; do   # contar y ajustes se hacen tocando un botón a mano
  xcrun simctl terminate "$U" com.nachosanbenito.bote 2>/dev/null || true
  xcrun simctl launch "$U" com.nachosanbenito.bote -demo $e >/dev/null; sleep 3
  xcrun simctl io "$U" screenshot capturas/raw-$e.png
done
mkdir -p capturas/63; for f in capturas/0*.png; do sips -z 2622 1206 "$f" --out "capturas/63/$(basename $f)" >/dev/null; done
