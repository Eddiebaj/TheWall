import WidgetKit
import SwiftUI

struct TransitEntry: TimelineEntry {
    let date: Date
    let stopName: String
    let arrivals: [ArrivalInfo]
    let isLive: Bool
    let updatedAt: Date
}

struct ArrivalInfo: Identifiable {
    let id = UUID()
    let routeId: String
    let headsign: String
    let minsAway: Int
    let isLive: Bool
}

struct TransitWidgetEntryView: View {
    var entry: TransitEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(entry.stopName)
                    .font(.system(size: family == .systemSmall ? 13 : 15, weight: .bold))
                    .lineLimit(1)
                Spacer()
                Image("WidgetLogo")
                    .resizable()
                    .frame(width: 16, height: 16)
                    .opacity(0.6)
            }

            if entry.arrivals.isEmpty {
                Text("No upcoming buses")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            } else {
                let maxArrivals = family == .systemSmall ? 1 : 3
                ForEach(entry.arrivals.prefix(maxArrivals)) { arrival in
                    HStack(spacing: 6) {
                        Text(arrival.routeId)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.red)
                            .cornerRadius(4)

                        Text(arrival.headsign)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .lineLimit(1)

                        Spacer()

                        if arrival.minsAway <= 0 {
                            Text("Due")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.green)
                        } else {
                            Text("in \(arrival.minsAway) min")
                                .font(.system(size: 14, weight: .semibold))
                        }

                        if arrival.isLive {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 6, height: 6)
                        } else {
                            Text("Sched")
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }

            Spacer()

            Text(entry.isLive ? "Live" : "Cached")
                .font(.system(size: 9))
                .foregroundColor(.secondary)
        }
        .padding(12)
    }
}

struct TransitWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> TransitEntry {
        TransitEntry(
            date: Date(),
            stopName: "Loading...",
            arrivals: [ArrivalInfo(routeId: "95", headsign: "Barrhaven", minsAway: 4, isLive: true)],
            isLive: true,
            updatedAt: Date()
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (TransitEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TransitEntry>) -> Void) {
        // Read from App Group UserDefaults (shared with main app)
        let defaults = UserDefaults(suiteName: "group.com.routeo.app")
        let stopName = defaults?.string(forKey: "widget_stop_name") ?? "No stop saved"

        var arrivals: [ArrivalInfo] = []
        if let data = defaults?.data(forKey: "widget_arrivals"),
           let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            arrivals = json.compactMap { dict in
                guard let routeId = dict["routeId"] as? String,
                      let headsign = dict["headsign"] as? String,
                      let minsAway = dict["minsAway"] as? Int else { return nil }
                let isLive = (dict["source"] as? String)?.contains("rt") ?? false
                return ArrivalInfo(routeId: routeId, headsign: headsign, minsAway: minsAway, isLive: isLive)
            }
        }

        let isLive = defaults?.bool(forKey: "widget_is_live") ?? false
        let updatedAt = defaults?.object(forKey: "widget_updated_at") as? Date ?? Date()

        let entry = TransitEntry(
            date: Date(),
            stopName: stopName,
            arrivals: arrivals,
            isLive: isLive,
            updatedAt: updatedAt
        )

        // Refresh every 5 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

@main
struct TransitWidget: Widget {
    let kind: String = "TransitWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TransitWidgetProvider()) { entry in
            TransitWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Next Bus")
        .description("See your next bus arrival at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
