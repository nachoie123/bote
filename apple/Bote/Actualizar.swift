#if os(macOS)
import SwiftUI
import Sparkle

/// Actualizaciones del Mac (Sparkle): mira cada día el appcast de nachosanbenito.com y, si hay versión nueva,
/// la baja y la instala sola al cerrar la app. El menú «Buscar actualizaciones…» lo hace al momento.
enum Actualizador {
    static let control = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil,
                                                      userDriverDelegate: nil)
}

struct MenuActualizar: Commands {
    var body: some Commands {
        CommandGroup(after: .appInfo) {
            Button("Buscar actualizaciones…") { Actualizador.control.updater.checkForUpdates() }
        }
    }
}
#endif
