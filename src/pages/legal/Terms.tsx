import { Link } from 'react-router-dom';
import { ContactEmail, LegalPage, LegalSection, PROSE_LINK, ShortVersion } from './LegalPage';

const S = {
  what: { id: 'what', title: 'What FBLC is' },
  affiliation: { id: 'affiliation', title: 'Not affiliated with FBLA or FBL Canada' },
  account: { id: 'account', title: 'Your account' },
  fair: { id: 'fair', title: 'Playing fair' },
  posts: { id: 'posts', title: 'What you post' },
  leaders: { id: 'leaders', title: 'Chapter leaders' },
  content: { id: 'content', title: 'Practice questions' },
  email: { id: 'email', title: 'Email' },
  deca: { id: 'deca', title: 'DECA Masters' },
  service: { id: 'service', title: 'The service can change' },
  ending: { id: 'ending', title: 'Leaving, and removing accounts' },
  limits: { id: 'limits', title: 'No guarantees' },
  changes: { id: 'changes', title: 'Changes to these terms' },
  law: { id: 'law', title: 'Which law applies' },
  contact: { id: 'contact', title: 'Contact' },
  lawyer: { id: 'lawyer', title: 'Not reviewed by a lawyer' },
};

const privacy = (
  <Link className={PROSE_LINK} to="/privacy">
    Privacy policy
  </Link>
);

export default function Terms() {
  return (
    <LegalPage
      title="Terms of use"
      intro="Effective October 11, 2026. The rules for using FBLC, in plain language. Not reviewed by a lawyer."
      sections={Object.values(S)}
    >
      <ShortVersion>
        <li>FBLC is a free, independent practice site. FBLA and FBL Canada don't run it or endorse it.</li>
        <li>The questions are written for practice. They are not official test items, and nothing here guarantees a result.</li>
        <li>Keep your account to yourself, play fair and be kind to other members.</li>
        <li>You can leave and ask us to delete your account at any time. The {privacy} explains what we keep.</li>
      </ShortVersion>

      <LegalSection {...S.what}>
        <p>
          FBLC is a study site with practice exams, vocab decks, 1v1 duels and chapter tools for FBL Canada members. It is
          free, has no ads, and is built and run by two students, Joseph and Kaden. By making an account or using the
          site, you agree to these terms and to the {privacy}.
        </p>
      </LegalSection>

      <LegalSection {...S.affiliation}>
        <p>
          FBLC is an independent study tool. It is not affiliated with, sponsored by or endorsed by Future Business
          Leaders of America (FBLA-PBL), FBL Canada (FBLC) or any school. The FBLA, FBL Canada and FBLC names and logos
          belong to their owners and appear here only to show which competitions the practice is for. For official
          rules, events and results, go to your chapter adviser or{' '}
          <a className={PROSE_LINK} href="https://fblc.ca" target="_blank" rel="noreferrer">
            fblc.ca
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection {...S.account}>
        <p>
          FBLC is for FBL Canada members, mostly students in grades 7 to 12. If you are under 13, a parent or guardian
          needs to agree before you make an account. An account is for one person: give accurate details, keep your
          password private, and tell us straight away if someone else has used your account. Don't pretend to be someone
          else.
        </p>
      </LegalSection>

      <LegalSection {...S.fair}>
        <p>
          Don't use bots, scripts or other people to answer questions or gain Elo. Don't copy, scrape or share the
          question bank or answer keys. Don't try to get at other members' information or break the site. Don't harass,
          threaten or insult anyone in duels, chapter posts, bios or anywhere else on the site.
        </p>
      </LegalSection>

      <LegalSection {...S.posts}>
        <p>
          What you write and upload (your bio, photo, chapter posts, tests and decks) stays yours. You let FBLC store it
          and show it to the members who are meant to see it. Don't post anything hateful, sexual, violent or illegal,
          anything you don't have the right to share, or anyone's private information. We can remove anything that breaks
          these rules.
        </p>
        <p>If you send us feedback or report a question, we can use it to improve the site.</p>
      </LegalSection>

      <LegalSection {...S.leaders}>
        <p>
          Presidents and executives can manage their chapter's members, roles, attendance, assignments and posts, and they
          and trainers can see members' practice results. Use those tools only for your own chapter and only for chapter
          business.
        </p>
      </LegalSection>

      <LegalSection {...S.content}>
        <p>
          Questions and vocab terms are written for this site from published competency areas. They are not official FBLA
          or FBL Canada test items, and your score here can't predict how you will do at a real competition. We make
          mistakes: when we find a wrong answer key or an unclear question, we fix it, and we are glad when you report one.
        </p>
      </LegalSection>

      <LegalSection {...S.email}>
        <p>
          Email is on when you join: a weekly overview, a reminder if you haven't practised in a while, and your chapter's
          newsletters. Turn it off any time in Settings or with the unsubscribe link in any email. Account emails, such
          as password resets, are always sent.
        </p>
      </LegalSection>

      <LegalSection {...S.deca}>
        <p>
          DECA Masters, our sister practice site for DECA, is moving onto the same account system as FBLC. Once it has,
          one account will work on both sites. These terms cover FBLC; DECA Masters will have its own.
        </p>
      </LegalSection>

      <LegalSection {...S.service}>
        <p>
          We try to keep FBLC running, but it may be slow, offline or different from one day to the next. Answers you give
          while offline may not be saved. We may change, pause or close parts of the site, and for big changes we will try
          to tell members first.
        </p>
      </LegalSection>

      <LegalSection {...S.ending}>
        <p>
          You can stop using FBLC at any time and ask us to delete your account by emailing <ContactEmail />. We can
          suspend or delete an account that breaks these terms, and we will tell the member why when we can.
        </p>
      </LegalSection>

      <LegalSection {...S.limits}>
        <p>
          FBLC is provided as it is. We don't promise that it will always work, that every answer key is right, or that it
          will help you win. As far as the law allows, we are not responsible for losses that come from using it. Nothing
          in these terms takes away rights you have under the law of Ontario or Canada.
        </p>
      </LegalSection>

      <LegalSection {...S.changes}>
        <p>
          We may update these terms. When we do, we will change the date at the top, and for important changes we will
          tell members in the app before they take effect. If you keep using FBLC after that, the new terms apply.
        </p>
      </LegalSection>

      <LegalSection {...S.law}>
        <p>These terms are governed by the laws of Ontario and the federal laws of Canada that apply there.</p>
      </LegalSection>

      <LegalSection {...S.contact}>
        <p>
          Questions about these terms go to <ContactEmail />.
        </p>
      </LegalSection>

      <LegalSection {...S.lawyer}>
        <p>
          Two students wrote these terms to describe how the site works. A lawyer has not reviewed them, and they are not
          legal advice.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
