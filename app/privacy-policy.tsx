import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function PrivacyPolicy() {
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
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 }}>Privacy Policy</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>Affiche</Text>
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.updated}>Last updated: May 20, 2026</Text>
        </View>

        <Section title="1. Information We Collect">
          <P>We collect the following information when you use Affiche:</P>
          <Bullet>
            <B>Account information:</B> Your email address and username when you create an account.
          </Bullet>
          <Bullet>
            <B>Location data:</B> Your approximate location when you upload a moment (photo or video), used solely to match your content to a nearby venue.
          </Bullet>
          <Bullet>
            <B>Content:</B> Photos and videos you choose to post as moments.
          </Bullet>
          <Bullet>
            <B>Usage data:</B> Basic app interaction data (e.g., which venues you view) to improve the product.
          </Bullet>
        </Section>

        <Section title="2. How We Use Your Information">
          <P>We use the information we collect to:</P>
          <Bullet>Provide and operate the Affiche social experience, including friend connections and group sharing.</Bullet>
          <Bullet>Match your moments to the correct venue based on location at upload time.</Bullet>
          <Bullet>Display your moments to friends and, where applicable, other users at the same venue.</Bullet>
          <Bullet>Send you notifications related to your account and social activity (you can opt out in settings).</Bullet>
          <Bullet>Improve, debug, and develop new features in the app.</Bullet>
        </Section>

        <Section title="3. We Do Not Sell Your Data">
          <P>
            We do not sell, rent, or trade your personal information to any third party for marketing or advertising purposes ever.
          </P>
        </Section>

        <Section title="4. Data Sharing">
          <P>We share your data only in limited circumstances:</P>
          <Bullet>
            <B>Service providers:</B> Trusted third-party services that help us operate Affiche (e.g., cloud storage, analytics) under strict confidentiality agreements.
          </Bullet>
          <Bullet>
            <B>Legal requirements:</B> If required by law or to protect the rights and safety of our users.
          </Bullet>
          <P>Your moments are visible to other users according to the sharing settings you choose (friends only, group, or venue-wide).</P>
        </Section>

        <Section title="5. Data Retention">
          <P>
            We retain your data for as long as your account is active. If you delete your account, we will delete your personal information and content within 30 days, except where retention is required by law.
          </P>
        </Section>

        <Section title="6. How to Delete Your Account">
          <P>
            You can delete your account directly in the app under Account settings. Alternatively, email us at{' '}
            <Text style={styles.link}>privacy@affiche.app</Text> with the subject line "Delete My Account". We will process your request within 7 business days.
          </P>
        </Section>

        <Section title="7. Children's Privacy">
          <P>
            Affiche is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us immediately.
          </P>
        </Section>

        <Section title="8. Security">
          <P>
            We use industry-standard security measures to protect your data, including encrypted connections (HTTPS/TLS) and secure cloud infrastructure. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </P>
        </Section>

        <Section title="9. Changes to This Policy">
          <P>
            We may update this Privacy Policy from time to time. We will notify you of significant changes via email or an in-app notice. Continued use of Affiche after changes take effect constitutes your acceptance of the updated policy.
          </P>
        </Section>

        <Section title="10. Contact Us">
          <P>If you have any questions or concerns about this Privacy Policy, please contact us:</P>
          <P>
            <B>Email:</B>{' '}
            <Text style={styles.link}>privacy@affiche.app</Text>
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
