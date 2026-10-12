import Foundation

#if DEBUG
/// Datos de ejemplo para las capturas de la App Store. Solo en DEBUG, solo si la
/// app se lanza con `-demo <inicio|partida|reparto>`:
///   xcrun simctl launch <udid> com.nachosanbenito.bote -demo partida
enum Demo {
    static var escenario: String? {
        let a = CommandLine.arguments
        guard let i = a.firstIndex(of: "-demo"), i + 1 < a.count else { return nil }
        return a[i + 1]
    }

    /// JS que deja el estado en localStorage antes de que arranque la web.
    static func script(_ escenario: String) -> String {
        let cerrada = escenario != "partida" && escenario != "contar"
        let activa = escenario == "inicio" ? "null" : "\"p1\""
        let fichas = """
        [{"id":"blanca","nombre":"Blancas","color":"#e8e8ea","valor":10,"unidades":150},
         {"id":"roja","nombre":"Rojas","color":"#dc2626","valor":50,"unidades":100},
         {"id":"negra","nombre":"Negras","color":"#27272a","valor":100,"unidades":100}]
        """
        func buyin(_ j: String, _ h: String) -> String {
            "{\"id\":\"m\(j)\(h)\",\"ts\":\"2026-10-10T\(h):00+02:00\",\"tipo\":\"buyin\",\"jugador\":\"\(j)\",\"importe\":2000}"
        }
        let movimientos = [
            buyin("nacho", "19:32"), buyin("marta", "19:32"), buyin("lucas", "19:33"),
            buyin("sofia", "19:33"), buyin("dani", "19:41"),
            buyin("lucas", "20:58"), buyin("dani", "21:47"),
        ].joined(separator: ",")
        // Suma 140,00 €, justo lo que hay en la mesa (5 entradas + 2 recompras).
        let conteo = """
        {"nacho":{"negra":25,"roja":25,"blanca":10},
         "marta":{"negra":40,"roja":22,"blanca":10},
         "lucas":{"negra":8,"roja":7,"blanca":8},
         "sofia":{"negra":18,"roja":16,"blanca":12},
         "dani":{"negra":6,"roja":6,"blanca":10}}
        """
        let p1 = """
        {"id":"p1","fecha":"2026-10-10T19:30:00Z","nombre":"Sábado en casa de Marta","cerrada":\(cerrada),
         "ajustes":{"buyIn":2000,"fichas":\(fichas)},
         "jugadores":[{"id":"nacho","nombre":"Nacho"},{"id":"marta","nombre":"Marta"},{"id":"lucas","nombre":"Lucas"},
                      {"id":"sofia","nombre":"Sofía"},{"id":"dani","nombre":"Dani"}],
         "movimientos":[\(movimientos)],
         "conteo":\(escenario == "partida" ? "{}" : conteo)}
        """
        func vieja(_ id: String, _ fecha: String, _ nombre: String, _ nombres: [String]) -> String {
            let js = nombres.map { "{\"id\":\"\($0.lowercased())\",\"nombre\":\"\($0)\"}" }.joined(separator: ",")
            let ms = nombres.map { "{\"id\":\"m\(id)\($0)\",\"ts\":\"\(fecha)\",\"tipo\":\"buyin\",\"jugador\":\"\($0.lowercased())\",\"importe\":2000}" }.joined(separator: ",")
            return "{\"id\":\"\(id)\",\"fecha\":\"\(fecha)\",\"nombre\":\"\(nombre)\",\"cerrada\":true,\"ajustes\":{\"buyIn\":2000,\"fichas\":\(fichas)},\"jugadores\":[\(js)],\"movimientos\":[\(ms)],\"conteo\":{}}"
        }
        let partidas = [
            p1,
            vieja("p2", "2026-10-03T20:00:00Z", "Viernes de cartas", ["Nacho", "Marta", "Lucas", "Pablo"]),
            vieja("p3", "2026-09-26T20:00:00Z", "Cumple de Lucas", ["Nacho", "Marta", "Lucas", "Sofía", "Dani", "Pablo"]),
        ].joined(separator: ",")
        let estado = "{\"v\":1,\"ajustes\":{\"buyIn\":2000,\"fichas\":\(fichas)},\"partidas\":[\(partidas)],\"activaId\":\(activa)}"
        return "localStorage.setItem('bote.v1', JSON.stringify(\(estado)));"
    }
}
#endif
