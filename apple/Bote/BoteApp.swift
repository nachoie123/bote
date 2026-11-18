import SwiftUI

@main
struct BoteApp: App {
    #if os(macOS)
    init() { _ = Actualizador.control }              // arranca Sparkle con la app
    #endif

    var body: some Scene {
        WindowGroup {
            WebView()
                .ignoresSafeArea()           // la web ya respeta la muesca con env(safe-area-inset-*)
                .background(Color(red: 11/255, green: 15/255, blue: 13/255))
        }
        #if os(macOS)
        .defaultSize(width: 430, height: 860)
        .commands { MenuActualizar() }
        #endif
    }
}
