import SwiftUI

struct ContentView: View {
    @State private var selectedTab: AppTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(selectedTab: $selectedTab)
                .tabItem {
                    Label("Home", systemImage: "sparkles")
                }
                .tag(AppTab.home)

            ShopView()
                .tabItem {
                    Label("Shop", systemImage: "bag")
                }
                .tag(AppTab.shop)

            VisitView()
                .tabItem {
                    Label("Visit", systemImage: "location")
                }
                .tag(AppTab.visit)
        }
        .tint(Color.goldAccent)
    }
}

private enum AppTab {
    case home
    case shop
    case visit
}

private struct HomeView: View {
    @Binding var selectedTab: AppTab
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    heroCard

                    Text("Quick Actions")
                        .font(.title2.bold())

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                        QuickActionCard(
                            title: "Shop Jewelry",
                            subtitle: "Browse rings, chains, earrings, and more.",
                            systemImage: "bag.fill",
                            action: { selectedTab = .shop }
                        )

                        QuickActionCard(
                            title: "Call Store",
                            subtitle: "(407) 322-6435",
                            systemImage: "phone.fill",
                            action: { openURL(URL(string: "tel://4073226435")!) }
                        )

                        QuickActionCard(
                            title: "Get Directions",
                            subtitle: "Altamonte Mall, lower level next to Macy's.",
                            systemImage: "map.fill",
                            action: {
                                openURL(
                                    URL(
                                        string: "http://maps.apple.com/?daddr=451+E+Altamonte+Dr+Suite+1165+Altamonte+Springs+FL+32701"
                                    )!
                                )
                            }
                        )

                        QuickActionCard(
                            title: "Google Reviews",
                            subtitle: "See why customers keep coming back.",
                            systemImage: "star.bubble.fill",
                            action: { openURL(URL(string: "https://maps.app.goo.gl/5P6uUymzv9EJwd728")!) }
                        )
                    }

                    detailsCard
                    categoryStrip
                    servicesCard
                    financingCard
                }
                .padding()
            }
            .background(Color.appBackground.ignoresSafeArea())
            .navigationTitle("Gold King")
        }
    }

    private var heroCard: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [Color.goldAccent, Color.goldAccent.opacity(0.7), Color.black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(alignment: .leading, spacing: 12) {
                Text("Gold King Jewelers")
                    .font(.system(size: 30, weight: .bold, design: .serif))
                    .foregroundStyle(.white)

                Text("Fine jewelry, custom designs, repairs, appraisals, and flexible financing in Altamonte Mall.")
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.9))

                HStack(spacing: 10) {
                    Label("Orlando's Best Jeweler", systemImage: "crown.fill")
                    Label("2000+ Reviews", systemImage: "star.fill")
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white.opacity(0.92))
            }
            .padding(24)
        }
        .frame(height: 240)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 20, y: 12)
    }

    private var detailsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Store Highlights", systemImage: "diamond.fill")
                .font(.headline)

            Text("Located on the lower level next to Macy's at Altamonte Mall.")
            Text("Open Monday through Saturday from 11:00 AM to 7:00 PM, and Sunday from 12:00 PM to 5:00 PM.")
            Text("The website currently promotes major seasonal savings, on-site jewelry and watch repairs, and financing options.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var categoryStrip: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Popular Categories")
                .font(.headline)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(["Rings", "Chains", "Bracelets", "Earrings", "Gemstones"], id: \.self) { item in
                        Text(item)
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 18)
                            .padding(.vertical, 12)
                            .background(Color.goldAccent.opacity(0.14))
                            .clipShape(Capsule())
                    }
                }
            }
        }
    }

    private var servicesCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("What You'll Find")
                .font(.headline)

            ForEach([
                "Rings, chains, bracelets, anklets, earrings, and gemstones",
                "Custom orders and jewelry design",
                "Jewelry and watch repairs",
                "Certified jewelry appraisals",
                "Financing and layaway options"
            ], id: \.self) { item in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(Color.goldAccent)

                    Text(item)
                        .foregroundStyle(.primary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var financingCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Flexible Financing")
                .font(.headline)

            Text("The website currently highlights financing and lease-to-own options so customers can shop now and pay over time.")
                .foregroundStyle(.secondary)

            Button {
                selectedTab = .shop
            } label: {
                HStack {
                    Text("Open Store")
                    Spacer()
                    Image(systemName: "arrow.right.circle.fill")
                }
                .font(.headline)
                .foregroundStyle(.black)
                .padding()
                .background(Color.goldAccent)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

private struct ShopView: View {
    @StateObject private var store = StoreViewModel()
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if store.isLoading {
                    ProgressView(value: store.estimatedProgress)
                        .tint(Color.goldAccent)
                        .padding(.horizontal)
                        .padding(.top, 8)
                }

                StoreWebView(viewModel: store)
            }
                .navigationTitle(store.pageTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .bottomBar) {
                        Button {
                            store.goBack()
                        } label: {
                            Image(systemName: "chevron.backward")
                        }
                        .disabled(!store.canGoBack)

                        Button {
                            store.goForward()
                        } label: {
                            Image(systemName: "chevron.forward")
                        }
                        .disabled(!store.canGoForward)

                        Spacer()

                        Button {
                            store.goHome()
                        } label: {
                            Image(systemName: "house")
                        }

                        Button {
                            store.reload()
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }

                        Button {
                            openURL(store.homeURL)
                        } label: {
                            Image(systemName: "safari")
                        }
                    }
                }
        }
    }
}

private struct VisitView: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            List {
                Section("Visit Us") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Gold King Jewelers")
                            .font(.headline)
                        Text("451 E. Altamonte Dr, Suite 1165")
                        Text("Altamonte Springs, FL 32701")
                        Text("Lower level next to Macy's")
                    }

                    Button("Open in Maps") {
                        openURL(
                            URL(
                                string: "http://maps.apple.com/?q=Gold+King+Jewelers&ll=28.6667,-81.3762"
                            )!
                        )
                    }

                    Button("Call (407) 322-6435") {
                        openURL(URL(string: "tel://4073226435")!)
                    }

                    Button("Email Store") {
                        openURL(URL(string: "mailto:goldkingjewelers@gmail.com")!)
                    }
                }

                Section("Hours") {
                    LabeledContent("Monday - Saturday", value: "11:00 AM - 7:00 PM")
                    LabeledContent("Sunday", value: "12:00 PM - 5:00 PM")
                }

                Section("Services") {
                    Text("Custom jewelry")
                    Text("Jewelry repair")
                    Text("Watch repair")
                    Text("Appraisals")
                    Text("Financing options")
                }

                Section("Social") {
                    Button("Instagram") {
                        openURL(URL(string: "https://instagram.com/goldkingjewelers")!)
                    }

                    Button("Facebook") {
                        openURL(URL(string: "https://facebook.com/goldkingjewelers")!)
                    }

                    Button("Pinterest") {
                        openURL(URL(string: "https://www.pinterest.com/goldkingjewelers")!)
                    }
                }
            }
            .navigationTitle("Visit")
        }
    }
}

private struct QuickActionCard: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: systemImage)
                    .font(.title2)
                    .foregroundStyle(Color.goldAccent)

                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)

                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, minHeight: 130, alignment: .topLeading)
            .padding(18)
            .background(.white)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private extension Color {
    static let goldAccent = Color(red: 0.78, green: 0.61, blue: 0.19)
    static let appBackground = Color(red: 0.96, green: 0.95, blue: 0.92)
}
