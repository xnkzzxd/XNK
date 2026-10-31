import SwiftUI
import WebKit

// Thin shell around book.xnkbooking.my.id (the wrapper page that hosts the Apps Script portal).
@main
struct XNKApp: App {
    var body: some Scene {
        WindowGroup {
            PortalView()
                .ignoresSafeArea() // the wrapper reads env(safe-area-inset-*) and passes it to the portal
                .background(Color(red: 0.043, green: 0.043, blue: 0.043))
                .preferredColorScheme(.dark)
        }
    }
}

struct PortalView: UIViewRepresentable {
    static let home = URL(string: "https://book.xnkbooking.my.id/")!

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = "XNKiOS" // the portal hides its on-screen back arrows
        config.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: config)
        web.allowsBackForwardNavigationGestures = true // side swipe = back
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false
        web.backgroundColor = .black
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.load(URLRequest(url: Self.home))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        static func isOurs(_ url: URL) -> Bool {
            guard let scheme = url.scheme, scheme == "https" || scheme == "http", let host = url.host else {
                return url.scheme == "about" || url.scheme == "blob" || url.scheme == "data"
            }
            return ["xnkbooking.my.id", "xnk.my.id", "google.com", "googleusercontent.com", "gstatic.com"]
                .contains { host == $0 || host.hasSuffix("." + $0) }
        }

        // wa.me, tel:, maps etc. open in their own apps.
        func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url, !Self.isOurs(url) else { return decisionHandler(.allow) }
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        // target=_blank / window.open
        func webView(_ web: WKWebView, createWebViewWith config: WKWebViewConfiguration,
                     for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if Self.isOurs(url) { web.load(action.request) } else { UIApplication.shared.open(url) }
            }
            return nil
        }

        func webView(_ web: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            present(UIAlertController(title: nil, message: message, preferredStyle: .alert),
                    actions: [UIAlertAction(title: "OK", style: .default) { _ in completionHandler() }])
        }

        func webView(_ web: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            present(UIAlertController(title: nil, message: message, preferredStyle: .alert),
                    actions: [UIAlertAction(title: "Batal", style: .cancel) { _ in completionHandler(false) },
                              UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) }])
        }

        private func present(_ alert: UIAlertController, actions: [UIAlertAction]) {
            actions.forEach(alert.addAction)
            let root = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.rootViewController
            root?.present(alert, animated: true)
        }
    }
}
