// Visible FAQ plus matching FAQPage structured data (answers must match what users see).
import JsonLd from './JsonLd';
import styles from './seo.module.css';

export interface FaqItem {
  q: string;
  a: string;
}

export default function Faq({ items }: { items: FaqItem[] }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Frequently asked questions</h2>
      <div className={styles.sectionBody}>
        <dl className={styles.faq}>
          {items.map((item) => (
            <div key={item.q}>
              <dt className={styles.faqQ}>{item.q}</dt>
              <dd className={styles.faqA} style={{ marginLeft: 0 }}>
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: items.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }}
      />
    </section>
  );
}
