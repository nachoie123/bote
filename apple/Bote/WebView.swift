import SwiftUI
import WebKit

#if os(iOS)
typealias Representable = UIViewRepresentable
#else
typealias Representable = NSViewRepresentable
#endif

/// La web de Bote dentro de una vista nativa. Se sirve desde el paquete con el
/// esquema bote:// (con file:// los módulos JS no cargan y localStorage no es fiable).
struct WebView: Representable {
    func hacer() -> WKWebView {
        let cfg = WKWebViewConfiguration()
        let puente = Puente()
        cfg.setURLSchemeHandler(Paquete(), forURLScheme: "bote")
        cfg.userContentController.add(puente, name: "bote")
        #if DEBUG
        if let e = Demo.escenario {   // capturas de la App Store: ver Demo.swift
            cfg.userContentController.addUserScript(WKUserScript(source: Demo.script(e), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
        #if os(iOS)
        // En la app no hay zoom: ni pellizco ni doble toque (al pulsar «+» rápido
        // ampliaba la pantalla y se comía un toque). La letra grande la da el iPhone.
        // Y se le dice a la web si este iPhone sabe contar fichas con una foto.
        cfg.userContentController.addUserScript(WKUserScript(source: """
            document.querySelector('meta[name=viewport]').content += ', maximum-scale=1, user-scalable=no';
            window.boteFotoDisponible = \(Foto.disponible);
            """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        #endif
        let w = WKWebView(frame: .zero, configuration: cfg)
        puente.web = w
        // Volver deslizando desde el borde, como en cualquier app: la web apunta
        // cada pantalla en el historial (history.pushState) y el gesto hace goBack().
        #if os(iOS)
        let borde = UIScreenEdgePanGestureRecognizer(target: DeslizarAtras.shared, action: #selector(DeslizarAtras.mover))
        borde.edges = .left
        borde.delegate = DeslizarAtras.shared
        w.addGestureRecognizer(borde)
        w.scrollView.contentInsetAdjustmentBehavior = .never
        w.scrollView.bounces = false
        w.scrollView.delegate = SinZoom.shared
        w.isOpaque = false
        w.backgroundColor = UIColor(red: 11/255, green: 15/255, blue: 13/255, alpha: 1)
        #else
        w.allowsBackForwardNavigationGestures = true
        w.setValue(false, forKey: "drawsBackground")
        #endif
        w.load(URLRequest(url: URL(string: "bote://app/index.html")!))
        return w
    }
    #if os(iOS)
    func makeUIView(context: Context) -> WKWebView { hacer() }
    func updateUIView(_ v: WKWebView, context: Context) {}
    #else
    func makeNSView(context: Context) -> WKWebView { hacer() }
    func updateNSView(_ v: WKWebView, context: Context) {}
    #endif
}

/// Sirve Resources/web/* como bote://app/*.
final class Paquete: NSObject, WKURLSchemeHandler {
    static let tipos = ["html": "text/html", "js": "text/javascript", "css": "text/css",
                        "png": "image/png", "svg": "image/svg+xml", "json": "application/json"]

    func webView(_ w: WKWebView, start tarea: WKURLSchemeTask) {
        guard let url = tarea.request.url, let raiz = Bundle.main.resourceURL?.appendingPathComponent("web") else { return }
        let ruta = url.path.isEmpty || url.path == "/" ? "/index.html" : url.path
        let fichero = raiz.appendingPathComponent(ruta).standardizedFileURL
        guard fichero.path.hasPrefix(raiz.standardizedFileURL.path), let datos = try? Data(contentsOf: fichero) else {
            tarea.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let tipo = Paquete.tipos[fichero.pathExtension] ?? "application/octet-stream"
        tarea.didReceive(URLResponse(url: url, mimeType: tipo, expectedContentLength: datos.count, textEncodingName: "utf-8"))
        tarea.didReceive(datos)
        tarea.didFinish()
    }
    func webView(_ w: WKWebView, stop tarea: WKURLSchemeTask) {}
}

/// Lo que una web no puede: hoja de compartir, vibración y contar con una foto.
/// Desde JS: window.webkit.messageHandlers.bote.postMessage({tipo:'compartir', texto}) /
/// {tipo:'vibrar'} / {tipo:'toque'} / {tipo:'contarFoto', colores:[…]}
final class Puente: NSObject, WKScriptMessageHandler {
    weak var web: WKWebView?

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let d = m.body as? [String: Any], let tipo = d["tipo"] as? String else { return }
        switch tipo {
        case "compartir": compartir(d["texto"] as? String ?? "")
        case "vibrar": vibrar()
        case "toque": toque()
        #if os(iOS)
        case "atras": DeslizarAtras.shared.puede = d["puede"] as? Bool ?? false
        #endif
        #if os(iOS)
        case "contarFoto":
            guard let web, var vc = web.window?.rootViewController else { return }
            while let p = vc.presentedViewController { vc = p }
            Foto.contar(colores: d["colores"] as? [String] ?? [], desde: vc, web: web)
        #endif
        default: break
        }
    }

    func compartir(_ texto: String) {
        guard let web else { return }
        #if os(iOS)
        guard var vc = web.window?.rootViewController else { return }
        while let p = vc.presentedViewController { vc = p }
        let hoja = UIActivityViewController(activityItems: [texto], applicationActivities: nil)
        hoja.popoverPresentationController?.sourceView = web
        hoja.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.midX, y: web.bounds.maxY - 80, width: 1, height: 1)
        vc.present(hoja, animated: true)
        #else
        let picker = NSSharingServicePicker(items: [texto])
        picker.show(relativeTo: NSRect(x: web.bounds.midX, y: 60, width: 1, height: 1), of: web, preferredEdge: .minY)
        #endif
    }

    func vibrar() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
    }

    /// El «clic» suave de los selectores de iOS, para los contadores de fichas.
    func toque() {
        #if os(iOS)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }
}

#if os(iOS)
/// El gesto de WebKit para volver no responde a las entradas que la web mete en
/// el historial; este sí. La pantalla sigue al dedo y, si se suelta pasado un tercio (o
/// con un tirón), vuelve atrás y la anterior entra desde la izquierda.
final class DeslizarAtras: NSObject, UIGestureRecognizerDelegate {
    static let shared = DeslizarAtras()
    /// Lo dice la web en cada pantalla (nativo('atras', {puede})): en el inicio no hay atrás.
    var puede = false

    // WebKit tiene sus propios gestos sobre la vista; sin esto se quedan con el toque.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otro: UIGestureRecognizer) -> Bool { true }

    @objc func mover(_ g: UIScreenEdgePanGestureRecognizer) {
        guard let w = g.view as? WKWebView, puede || w.transform != .identity else { return }
        let x = max(0, g.translation(in: w).x), ancho = w.bounds.width
        switch g.state {
        case .changed:
            w.transform = CGAffineTransform(translationX: x, y: 0)
        case .ended, .cancelled, .failed:
            let vuelve = g.state == .ended && (x > ancho / 3 || g.velocity(in: w).x > 600)
            UIView.animate(withDuration: 0.2, delay: 0, options: .curveEaseOut) {
                w.transform = vuelve ? CGAffineTransform(translationX: ancho, y: 0) : .identity
            } completion: { _ in
                guard vuelve else { return }
                w.evaluateJavaScript("history.back()", completionHandler: nil)
                w.transform = CGAffineTransform(translationX: -ancho * 0.25, y: 0)
                UIView.animate(withDuration: 0.25, delay: 0.02, options: .curveEaseOut) { w.transform = .identity }
            }
        default: break
        }
    }
}

/// Quita el pellizco de la vista web (el meta viewport no basta en WKWebView).
final class SinZoom: NSObject, UIScrollViewDelegate {
    static let shared = SinZoom()
    func viewForZooming(in s: UIScrollView) -> UIView? { nil }
}
#endif
