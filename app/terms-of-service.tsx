import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function TermsOfService() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(255,255,255,0.08)',
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color="#FF3B5C" />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 }}>Terms of Service</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>Affiche</Text>
          <Text style={styles.title}>Terms of Service</Text>
          <Text style={styles.updated}>Last updated: May 26, 2026</Text>
        </View>

        <Section title="1. Acceptance of Terms">
          <P>By creating an account or using Affiche, you agree to these Terms of Service. If you do not agree, do not use the app.</P>
        </Section>

        <Section title="2. Account Terms">
          <Bullet>You must be at least 13 years old to use Affiche.</Bullet>
          <Bullet>You are responsible for maintaining the security of your account and password.</Bullet>
          <Bullet>You are responsible for all activity that occurs under your account.</Bullet>
          <Bullet>You must not use Affiche for any illegal or unauthorized purpose.</Bullet>
          <Bullet>You must not, in your use of Affiche, violate any laws in your jurisdiction.</Bullet>
        </Section>

        <Section title="3. Event Content">
          <P>As an event organizer or user, you agree that content you post on Affiche:</P>
          <Bullet>Must be accurate and not misleading.</Bullet>
          <Bullet>Must not infringe on the intellectual property rights of others.</Bullet>
          <Bullet>Must not contain hate speech, harassment, or content that promotes violence.</Bullet>
          <Bullet>Must not advertise illegal goods or services.</Bullet>
          <P>We reserve the right to remove any content that violates these terms at our sole discretion, and to suspend or terminate accounts responsible for such content.</P>
        </Section>

        <Section title="4. Payments and Ticketing">
          <P>Certain features of Affiche may require payment. By making a purchase through Affiche you agree that:</P>
          <Bullet>All fees are in Canadian dollars unless stated otherwise.</Bullet>
          <Bullet>You authorize us to charge your payment method for any fees incurred.</Bullet>
          <Bullet>Refund policies for ticketed events are set by the event organizer, not Affiche.</Bullet>
          <Bullet>Affiche is not responsible for events that are cancelled, postponed, or changed by organizers.</Bullet>
        </Section>

        <Section title="5. Limitation of Liability">
          <P>
            To the maximum extent permitted by applicable law, Affiche and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
          </P>
          <P>
            Affiche does not endorse, guarantee, or take responsibility for any events listed on the platform. Attendance at events is at your own risk.
          </P>
        </Section>

        <Section title="6. Termination">
          <P>
            We may suspend or terminate your account at any time for conduct that we believe violates these Terms of Service or is harmful to other users, us, third parties, or for any other reason at our sole discretion.
          </P>
        </Section>

        <Section title="7. Changes to These Terms">
          <P>
            We reserve the right to modify these terms at any time. We will notify you of material changes via email or in-app notice. Continued use of Affiche after changes take effect constitutes your acceptance of the updated terms.
          </P>
        </Section>

        <Section title="8. Governing Law">
          <P>
            These Terms of Service are governed by and construed in accordance with the laws of the Province of Ontario and the federal laws of Canada applicable therein, without regard to conflict of law provisions. Any disputes arising under these terms shall be subject to the exclusive jurisdiction of the courts located in Toronto, Ontario, Canada.
          </P>
        </Section>

        <Section title="9. Contact Us">
          <P>If you have any questions about these Terms of Service, please contact us:</P>
          <P>
            <B>Email:</B>{' '}
            <Text style={styles.link}>legal@affiche.app</Text>
          </P>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>{'\u2022'}</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 24,
    paddingBottom: 60,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 24,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FF3B5C',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 6,
  },
  updated: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 24,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '600',
    color: '#ffffff',
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginRight: 8,
    lineHeight: 24,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 24,
  },
  link: {
    color: '#FF3B5C',
    textDecorationLine: 'underline',
  },
});
