import SwiftUI
import UIKit
import WebKit

struct StoreWebView: UIViewRepresentable {
    @ObservedObject var viewModel: StoreViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        viewModel.attach(webView: webView)
        webView.load(URLRequest(url: viewModel.homeURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        viewModel.attach(webView: webView)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let viewModel: StoreViewModel

        init(viewModel: StoreViewModel) {
            self.viewModel = viewModel
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            viewModel.refreshState()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            viewModel.refreshState()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            viewModel.refreshState()
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            viewModel.refreshState()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let tappedURL = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            if shouldOpenExternally(tappedURL) {
                UIApplication.shared.open(tappedURL)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        private func shouldOpenExternally(_ url: URL) -> Bool {
            let externalHosts = [
                "facebook.com",
                "www.facebook.com",
                "instagram.com",
                "www.instagram.com",
                "pinterest.com",
                "www.pinterest.com",
                "twitter.com",
                "www.twitter.com",
                "x.com",
                "www.x.com",
                "maps.app.goo.gl",
                "apply.snapfinance.com",
                "approve.me",
                "ams.acima.com",
                "shopify.com",
                "www.shopify.com"
            ]

            if ["tel", "mailto", "sms"].contains(url.scheme?.lowercased() ?? "") {
                return true
            }

            guard let host = url.host?.lowercased() else {
                return false
            }

            return externalHosts.contains(host)
        }
    }
}
