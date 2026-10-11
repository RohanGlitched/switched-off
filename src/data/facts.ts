// Headline facts for the Why page, each with the source it was checked against (11 Oct 2026).
export type Fact = { big: string; text: string; source: string; url: string }
export const FACTS: Fact[] = [
  {
    big: '1st',
    text: 'India ordered more internet shutdowns than any other country for six years running, 2018 to 2023 (134, 121, 109, 106, 84 and 116), and was second only to Myanmar in 2024 (84) and 2025 (65).',
    source: 'Access Now #KeepItOn, 2023 and 2024 reports',
    url: 'https://www.accessnow.org/press-release/keepiton-internet-shutdowns-2024-en/',
  },
  {
    big: '212',
    text: 'days of statewide shutdown in Manipur in 2023, covering about 3.2 million people: the longest in the world that year, kept going by a series of 44 orders.',
    source: 'Access Now, 2023',
    url: 'https://www.accessnow.org/press-release/india-keepiton-internet-shutdowns-2023-en/',
  },
  {
    big: '~550',
    text: 'days without 4G in Jammu and Kashmir, from August 2019 until 4G was restored across the territory on 5 February 2021.',
    source: 'Business Today',
    url: 'https://www.businesstoday.in/latest/economy-politics/story/4g-internet-services-restored-in-jammu-and-kashmir-286694-2021-02-05',
  },
  {
    big: '0',
    text: 'The Union government keeps no count. In 2023 the telecom department and the home ministry told Parliament they were “not aware of the number of internet shutdowns imposed by the States”.',
    source: 'MediaNama, on the committee’s Action Taken Report',
    url: 'https://www.medianama.com/2023/03/223-7-recommendations-internet-shutdowns-telecom-dept/',
  },
  {
    big: '2021',
    text: 'Parliament’s IT committee recommended a centralised database of every shutdown, recording its duration, reasons and authority. Five years on, none exists. This register is that database.',
    source: 'PRS summary of the 26th Report',
    url: 'https://prsindia.org/policy/report-summaries/suspension-of-telecom-services-internet-and-its-impact',
  },
  {
    big: '$585M',
    text: 'what shutdowns cost India in 2023, across 7,812 hours of disruption, with Manipur the largest share. In 2020 the figure was $2.8 billion.',
    source: 'Top10VPN, via MediaNama',
    url: 'https://www.medianama.com/2024/01/223-top10vpn-india-internet-shutdown-2023-cost/',
  },
]
