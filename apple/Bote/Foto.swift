#if os(iOS)
import UIKit
import PhotosUI
import WebKit
import FoundationModels

/// Contar fichas con una foto, con el modelo de Apple que corre dentro del
/// iPhone (iOS 27, Apple Intelligence). La foto no sale del teléfono.
/// La web pide `nativo('contarFoto', {colores})` y recibe `boteFoto({cuentas})`
/// o `boteFoto({error})`. Los números son una sugerencia: la web los deja editables.
enum Foto {
    /// ¿Puede este iPhone contar con una foto? Se le dice a la web al arrancar.
    static var disponible: Bool {
        guard #available(iOS 27.0, *) else { return false }
        let m = SystemLanguageModel.default
        return m.isAvailable && m.capabilities.contains(.vision)
    }

    static func contar(colores: [String], desde vc: UIViewController, web: WKWebView) {
        let selector = Selector(alTerminar: { imagen in
            guard let imagen else { return }       // cancelada: la web no hace nada
            Task { @MainActor in
                web.evaluateJavaScript("window.boteFoto && window.boteFoto({contando:true})", completionHandler: nil)
                let json: String
                do { json = try await recuento(imagen, colores: colores) }
                catch { json = #"{"error":"No he podido contar las fichas de esa foto. Pon los números a mano."}"# }
                web.evaluateJavaScript("window.boteFoto && window.boteFoto(\(json))", completionHandler: nil)
            }
        })
        selector.presentar(desde: vc)
    }

    /// Devuelve `{"cuentas":{"Blancas":48,…}}`.
    static func recuento(_ imagen: UIImage, colores: [String]) async throws -> String {
        guard #available(iOS 27.0, *), let cg = imagen.cgImage else { throw CocoaError(.featureUnsupported) }
        let sesion = LanguageModelSession(instructions: """
            Cuentas fichas de póker en fotos. Para cada color de la lista di cuántas fichas \
            de ese color hay. Si están apiladas, calcula cuántas hay en cada pila por su \
            altura (una ficha mide unos 3,3 mm de grosor y 40 mm de ancho) y súmalas. \
            Si un color no aparece, pon 0.
            """)
        let r = try await sesion.respond(generating: Recuento.self) {
            "Colores: \(colores.joined(separator: ", ")). ¿Cuántas fichas de cada color hay en esta foto?"
            Attachment(cg, orientation: CGImagePropertyOrientation(imagen.imageOrientation))
        }
        let cuentas = Dictionary(r.content.colores.map { ($0.nombre, max(0, $0.cantidad)) }, uniquingKeysWith: +)
        let datos = try JSONSerialization.data(withJSONObject: ["cuentas": cuentas])
        return String(decoding: datos, as: UTF8.self)
    }
}

@available(iOS 27.0, *)
@Generable struct Recuento {
    @Guide(description: "Una entrada por cada color de la lista, en el mismo orden")
    var colores: [Cuenta]
}

@available(iOS 27.0, *)
@Generable struct Cuenta {
    @Guide(description: "El color, escrito igual que en la lista")
    var nombre: String
    @Guide(description: "Cuántas fichas de ese color hay en la foto", .minimum(0))
    var cantidad: Int
}

/// Cámara si la hay (en el simulador no), si no la fototeca. Se retiene a sí
/// mismo hasta que el usuario termina.
private final class Selector: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate, PHPickerViewControllerDelegate {
    private var vivo: Selector?
    private let alTerminar: (UIImage?) -> Void
    init(alTerminar: @escaping (UIImage?) -> Void) { self.alTerminar = alTerminar }

    func presentar(desde vc: UIViewController) {
        vivo = self
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            let p = UIImagePickerController()
            p.sourceType = .camera
            p.delegate = self
            vc.present(p, animated: true)
        } else {
            var cfg = PHPickerConfiguration()
            cfg.filter = .images
            let p = PHPickerViewController(configuration: cfg)
            p.delegate = self
            vc.present(p, animated: true)
        }
    }

    private func fin(_ img: UIImage?) { alTerminar(img); vivo = nil }

    func imagePickerController(_ p: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        p.dismiss(animated: true); fin(info[.originalImage] as? UIImage)
    }
    func imagePickerControllerDidCancel(_ p: UIImagePickerController) { p.dismiss(animated: true); fin(nil) }

    func picker(_ p: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        p.dismiss(animated: true)
        guard let item = results.first?.itemProvider, item.canLoadObject(ofClass: UIImage.self) else { fin(nil); return }
        item.loadObject(ofClass: UIImage.self) { obj, _ in
            DispatchQueue.main.async { self.fin(obj as? UIImage) }
        }
    }
}

private extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
#endif
