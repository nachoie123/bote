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
        let w = WKWebView(frame: .zero, configuration: cfg)
        puente.web = w
        #if os(iOS)
        w.scrollView.contentInsetAdjustmentBehavior = .never
        w.scrollView.bounces = false
        w.isOpaque = false
        w.backgroundColor = UIColor(red: 11/255, green: 15/255, blue: 13/255, alpha: 1)
        #else
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

/// Lo que una web no puede: hoja de compartir del sistema y vibración.
/// Desde JS: window.webkit.messageHandlers.bote.postMessage({tipo:'compartir', texto}) / {tipo:'vibrar'}
final class Puente: NSObject, WKScriptMessageHandler {
    weak var web: WKWebView?

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let d = m.body as? [String: Any], let tipo = d["tipo"] as? String else { return }
        switch tipo {
        case "compartir": compartir(d["texto"] as? String ?? "")
        case "vibrar": vibrar()
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
}
