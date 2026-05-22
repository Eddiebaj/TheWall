import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function PrivacyPolicy() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.brand}>affiche</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: May 20, 2026</Text>
      </View>

      <Section title="1. Information We Collect">
        <P>We collect the following information when you use affiche:</P>
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
        <Bullet>Provide and operate the affiche social experience, including friend connections and group sharing.</Bullet>
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
          <B>Service providers:</B> Trusted third-party services that help us operate affiche (e.g., cloud storage, analytics) under strict confidentiality agreements.
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
          To request deletion of your account and all associated data, email us at{' '}
          <Text style={styles.link}>privacy@thewall.app</Text> with the subject line "Delete My Account". We will process your request within 7 business days.
        </P>
      </Section>

      <Section title="7. Children's Privacy">
        <P>
          affiche is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us immediately.
        </P>
      </Section>

      <Section title="8. Security">
        <P>
          We use industry-standard security measures to protect your data, including encrypted connections (HTTPS/TLS) and secure cloud infrastructure. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
        </P>
      </Section>

      <Section title="9. Changes to This Policy">
        <P>
          We may update this Privacy Policy from time to time. We will notify you of significant changes via email or an in-app notice. Continued use of affiche after changes take effect constitutes your acceptance of the updated policy.
        </P>
      </Section>

      <Section title="10. Contact Us">
        <P>If you have any questions or concerns about this Privacy Policy, please contact us:</P>
        <P>
          <B>Email:</B>{' '}
          <Text style={styles.link}>privacy@thewall.app</Text>
        </P>
      </Section>
    </ScrollView>
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
    backgroundColor: '#ffffff',
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
    borderBottomColor: '#e5e5e5',
    paddingBottom: 24,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 6,
  },
  updated: {
    fontSize: 13,
    color: '#888888',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 24,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '600',
    color: '#111111',
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 15,
    color: '#333333',
    marginRight: 8,
    lineHeight: 24,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#333333',
    lineHeight: 24,
  },
  link: {
    color: '#0066cc',
    textDecorationLine: 'underline',
  },
});
