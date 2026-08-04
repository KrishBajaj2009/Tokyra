import Foundation
import SwiftUI
import WebKit

final class StoreViewModel: ObservableObject {
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = true
    @Published var pageTitle = "Shop"
    @Published var estimatedProgress = 0.0

    weak var webView: WKWebView?

    let homeURL = URL(string: "https://goldkingjewelers.com/")!

    func attach(webView: WKWebView) {
        guard self.webView !== webView else { return }
        self.webView = webView
        refreshState()
    }

    func refreshState() {
        guard let webView else { return }
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        isLoading = webView.isLoading
        estimatedProgress = webView.estimatedProgress
        pageTitle = webView.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? (webView.title ?? "Shop")
            : "Shop"
    }

    func goBack() {
        webView?.goBack()
    }

    func goForward() {
        webView?.goForward()
    }

    func reload() {
        webView?.reload()
    }

    func goHome() {
        webView?.load(URLRequest(url: homeURL))
    }
}
