import WidgetKit
import SwiftUI

// MARK: - Models

struct WidgetEvent: Identifiable {
    let id: String
    let title: String
    let venue: String
    let time: String
    let friendCount: Int
    let friendAvatarUrls: [String]
}

struct AficheEntry: TimelineEntry {
    let date: Date
    let events: [WidgetEvent]
    let updatedAt: Date
}

// MARK: - Provider

struct AficheWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> AficheEntry {
        AficheEntry(
            date: Date(),
            events: [
                WidgetEvent(id: "1", title: "DJ Night at Rebel", venue: "Rebel", time: "10 PM", friendCount: 3, friendAvatarUrls: []),
                WidgetEvent(id: "2", title: "Jazz & Cocktails", venue: "The Rex", time: "8 PM", friendCount: 1, friendAvatarUrls: []),
            ],
            updatedAt: Date()
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (AficheEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AficheEntry>) -> Void) {
        let defaults = UserDefaults(suiteName: "group.com.routeo.app")
        var events: [WidgetEvent] = []

        if let data = defaults?.data(forKey: "affiche_widget_events"),
           let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            events = json.compactMap { dict in
                guard
                    let id = dict["id"] as? String,
                    let title = dict["title"] as? String,
                    let venue = dict["venue"] as? String
                else { return nil }
                let time = dict["time"] as? String ?? ""
                let friendCount = dict["friendCount"] as? Int ?? 0
                let friendAvatarUrls = dict["friendAvatarUrls"] as? [String] ?? []
                return WidgetEvent(id: id, title: title, venue: venue, time: time, friendCount: friendCount, friendAvatarUrls: friendAvatarUrls)
            }
        }

        let updatedAt = defaults?.object(forKey: "affiche_widget_updated_at") as? Date ?? Date()
        let entry = AficheEntry(date: Date(), events: events, updatedAt: updatedAt)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

// MARK: - Small Widget View

struct SmallWidgetView: View {
    let entry: AficheEntry

    var body: some View {
        if let event = entry.events.first {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Tonight")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(red: 1, green: 0.231, blue: 0.361))
                        .textCase(.uppercase)
                        .tracking(0.5)
                    Spacer()
                    Text("affiche")
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundColor(.white.opacity(0.35))
                }

                Spacer()

                Text(event.venue)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
                    .lineLimit(1)

                Text(event.title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)

                HStack(spacing: 4) {
                    Image(systemName: "clock.fill")
                        .font(.system(size: 10))
                        .foregroundColor(Color(red: 1, green: 0.231, blue: 0.361))
                    Text(event.time)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                    if event.friendCount > 0 {
                        Text("· \(event.friendCount) friend\(event.friendCount == 1 ? "" : "s") going")
                            .font(.system(size: 10))
                            .foregroundColor(Color(red: 1, green: 0.231, blue: 0.361))
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Color(red: 0.04, green: 0.04, blue: 0.04))
        } else {
            EmptyWidgetView()
        }
    }
}

// MARK: - Medium Widget View

struct MediumWidgetView: View {
    let entry: AficheEntry

    var body: some View {
        let shown = Array(entry.events.prefix(3))

        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Tonight on affiche")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(red: 1, green: 0.231, blue: 0.361))
                    .textCase(.uppercase)
                    .tracking(0.5)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)

            if shown.isEmpty {
                Spacer()
                Text("No events tonight")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.35))
                    .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(shown) { event in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.title)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white)
                                .lineLimit(1)
                            HStack(spacing: 4) {
                                Text(event.venue)
                                    .font(.system(size: 11))
                                    .foregroundColor(.white.opacity(0.5))
                                if !event.time.isEmpty {
                                    Text("· \(event.time)")
                                        .font(.system(size: 11))
                                        .foregroundColor(.white.opacity(0.4))
                                }
                            }
                        }
                        Spacer()
                        if event.friendCount > 0 {
                            HStack(spacing: 2) {
                                Image(systemName: "person.2.fill")
                                    .font(.system(size: 9))
                                    .foregroundColor(Color(red: 1, green: 0.231, blue: 0.361))
                                Text("\(event.friendCount)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(Color(red: 1, green: 0.231, blue: 0.361))
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)

                    if event.id != shown.last?.id {
                        Divider()
                            .background(Color.white.opacity(0.07))
                            .padding(.leading, 14)
                    }
                }
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 0.04, green: 0.04, blue: 0.04))
    }
}

// MARK: - Empty State

struct EmptyWidgetView: View {
    var body: some View {
        VStack(spacing: 6) {
            Text("affiche")
                .font(.system(size: 14, weight: .heavy))
                .foregroundColor(Color(red: 1, green: 0.231, blue: 0.361))
            Text("No events tonight")
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.4))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.04, green: 0.04, blue: 0.04))
    }
}

// MARK: - Entry View

struct AficheWidgetEntryView: View {
    var entry: AficheEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}

// MARK: - Widget

@main
struct AficheWidget: Widget {
    let kind: String = "AficheWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AficheWidgetProvider()) { entry in
            AficheWidgetEntryView(entry: entry)
                .widgetURL(URL(string: "affiche://feed")!)
        }
        .configurationDisplayName("Tonight on affiche")
        .description("See tonight's events and where your friends are going.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
