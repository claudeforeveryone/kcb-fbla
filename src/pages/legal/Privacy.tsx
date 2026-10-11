import { Link } from 'react-router-dom';
import { ContactEmail, Item, Items, LegalPage, LegalSection, PROSE_LINK, ShortVersion } from './LegalPage';

const S = {
  who: { id: 'who', title: 'Who runs FBLC' },
  collect: { id: 'collect', title: 'What we collect and why' },
  notCollected: { id: 'not-collected', title: "What we don't collect" },
  sees: { id: 'who-sees', title: 'Who can see your information' },
  email: { id: 'email', title: 'Email' },
  providers: { id: 'providers', title: 'Services that help run the site' },
  deca: { id: 'deca', title: 'One account for FBLC and DECA Masters' },
  keep: { id: 'keep', title: 'How long we keep it' },
  safety: { id: 'safety', title: 'Keeping it safe' },
  choices: { id: 'choices', title: 'See, fix or delete your information' },
  minors: { id: 'minors', title: 'Members under 18, and parents' },
  law: { id: 'law', title: 'Canadian privacy law' },
  changes: { id: 'changes', title: 'Changes to this policy' },
  lawyer: { id: 'lawyer', title: 'Not reviewed by a lawyer' },
};

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="Effective October 11, 2026. Written in plain language for members, including members under 18, and their parents. Not reviewed by a lawyer."
      sections={Object.values(S)}
    >
      <ShortVersion>
        <li>We keep what the site needs to run: your sign-in, your profile and your practice records.</li>
        <li>Other signed-in members see your profile and your Elo. Nobody but you and the two of us can see your email.</li>
        <li>Your chapter's leaders can see your practice results, weak spots and attendance.</li>
        <li>We don't sell your information, show ads or track you for advertising.</li>
        <li>
          Email <ContactEmail /> to get a copy of your information, fix it or delete your account.
        </li>
      </ShortVersion>

      <LegalSection {...S.who}>
        <p>
          FBLC is a free, independent practice site built and run by two students, Joseph and Kaden. It is not a company,
          and it is not run by Future Business Leaders of America (FBLA-PBL), FBL Canada or any school. In this policy,
          &ldquo;FBLC&rdquo; means this study site, never the organisation FBL Canada. Joseph is responsible for this
          policy. Send questions, requests and complaints to <ContactEmail />.
        </p>
      </LegalSection>

      <LegalSection {...S.collect}>
        <Items>
          <Item term="Sign-in">
            Your email address and password. The password is stored only as a scrambled one-way hash, so nobody can read
            it, including us. We use your email to sign you in and to send account emails such as confirmation and
            password reset links.
          </Item>
          <Item term="Profile">
            Your username, display name, profile photo, school, grade, main event, bio and chapter. Used for your profile,
            the leaderboards and your chapter's member list.
          </Item>
          <Item term="Practice">
            Each answer you give in practice papers and duels (the question, the choice you picked, whether it was right
            and how long it took), your scores and times, your Elo rating, streaks, total practice time, when you were
            last active and your vocab review progress. When you check an answer during practice, we note that too, so
            only your first try counts toward your Elo.
          </Item>
          <Item term="Duels and friends">
            Who you challenge, the note you add to a challenge, results, and your friend requests.
          </Item>
          <Item term="Chapter">
            Your chapter and role, attendance records, and the posts, assignments, tests and decks your chapter shares. If
            a chapter leader bans you from the chapter, the reason they give is kept with the ban.
          </Item>
          <Item term="Notifications">
            The notices the app shows you (for example a duel challenge or a new assignment), whether you have read them,
            and whether you want our emails.
          </Item>
          <Item term="Feedback">
            If you use the feedback form or report a question: what you wrote, the kind of report, the page you were on,
            the question it is about, and our reply.
          </Item>
          <Item term="Usage counts">
            A short record when you do certain things, such as finishing a paper, opening a resource or starting a duel:
            what it was, when, the event code, and your account ID so we can count how many different members did it. It
            never includes question text, your answers, anything you typed, your IP address, your device or your
            location. We only ever look at totals.
          </Item>
          <Item term="Admin records">
            When a chapter role, ban, trainer or chapter changes, or when we look up a member's email address to answer a
            support request, we record who did it, to whom and when. This lets us look into misuse.
          </Item>
          <Item term="Profile photos">
            Stored as image files with a web link. The app shows the link to signed-in members, and anyone who has the
            link can open the photo. Don't upload a photo you wouldn't want shared that way.
          </Item>
          <Item term="On your device">
            Your browser keeps your sign-in session, your light or dark choice, and a few things that make practice work,
            such as an unfinished paper or duel, your study timer and your best vocab scores. Clearing your browser data
            removes them and signs you out. We don't use advertising or tracking cookies.
          </Item>
          <Item term="Server logs">
            Our hosting and database providers keep short-lived technical logs, which can include your IP address and
            browser, to keep the service secure and working. We only look at them to fix problems or stop attacks.
          </Item>
        </Items>
      </LegalSection>

      <LegalSection {...S.notCollected}>
        <p>
          We don't ask for your birthday, student number, home address, phone number, payment details or any government
          ID, and we don't collect your location. Please keep these out of your username, display name, bio and chapter
          posts.
        </p>
      </LegalSection>

      <LegalSection {...S.sees}>
        <p>None of your information is shown to people who are not signed in, apart from profile photo links (see above).</p>
        <Items>
          <Item term="You">Everything in your account.</Item>
          <Item term="Signed-in members">
            Your username, display name, photo, school, grade, main event, bio, chapter, Elo, practice totals, streaks,
            duel record and when you were last active. Never your email address.
          </Item>
          <Item term="Your chapter's leaders">
            For members of their chapter: practice results, weak spots, vocab progress and attendance. Presidents and
            executives see all events. Trainers see the events they train.
          </Item>
          <Item term="Your duel opponent">
            Your score, time and answers for a duel you both played, once the duel is over.
          </Item>
          <Item term="Friends">Your friend requests and who is on your friends list.</Item>
          <Item term="Joseph and Kaden">
            We can reach the database to keep the site running, fix problems and answer your requests, and we use that
            access only for those reasons. Our usage reports show totals only, and we hide any group smaller than five
            members.
          </Item>
        </Items>
      </LegalSection>

      <LegalSection {...S.email}>
        <p>
          Email is on when you join. We send a weekly overview (your practice, your Elo and your chapter's news), a
          reminder if you haven't practised in a week (at most four in a row), and your chapter's newsletters. Switch them
          off any time in Settings, on the Notifications page or with the unsubscribe link in every email. Account emails,
          such as password resets, are always sent.
        </p>
      </LegalSection>

      <LegalSection {...S.providers}>
        <Items>
          <Item term="Supabase">
            Our database, sign-in and photo storage, all in Supabase's Canada (Central) region, so your account and
            practice records are stored in Canada. Supabase also sends the account emails.
          </Item>
          <Item term="Vercel">
            Serves the website's files from servers around the world, so the pages may load from outside Canada. Vercel
            doesn't store your account or practice records.
          </Item>
          <Item term="Resend">
            Delivers our weekly and chapter emails to the address on your account. Resend is based in the United States,
            so these emails pass through the US.
          </Item>
        </Items>
        <p>We don't use advertising networks or third-party tracking tools, and we never sell or rent your information.</p>
      </LegalSection>

      <LegalSection {...S.deca}>
        <p>
          DECA Masters, a sister practice site for DECA, is moving onto the same account system and the same database
          project as FBLC. Once it has, the email and password you use here will also sign you in there, and an account
          made there will work here too. Each site keeps its own practice records in its own tables. Because it is one
          account, deleting it removes it from both sites. DECA Masters will explain what it collects in its own policy.
        </p>
      </LegalSection>

      <LegalSection {...S.keep}>
        <Items>
          <Item term="Your account">
            Your sign-in, profile, practice, duels, friends, notifications, feedback and usage counts are kept until your
            account is deleted, then deleted with it.
          </Item>
          <Item term="Usage counts">Deleted after 13 months, even if your account stays.</Item>
          <Item term="Chapter content">
            Posts, assignments, tests and decks you made for your chapter belong to the chapter. If your account is
            deleted they stay, without your name, until the chapter removes them or is deleted. Your own attendance
            records are deleted with your account.
          </Item>
          <Item term="Admin records">
            Kept after an account is deleted, so we can still look into misuse. They hold account IDs and what changed,
            never email addresses. We have not set an end date for them yet, and we will add one here when we do.
          </Item>
          <Item term="Backups">Copies in database backups disappear as those backups expire.</Item>
        </Items>
      </LegalSection>

      <LegalSection {...S.safety}>
        <p>
          The database itself decides who may read and change each record, so a member can't read another member's
          private information even by going around the app. Passwords are hashed, and the site is only served over
          HTTPS. No system is perfect: if you spot a problem, tell us at <ContactEmail />. If something goes wrong that
          could put you at risk, we will tell the members affected.
        </p>
      </LegalSection>

      <LegalSection {...S.choices}>
        <Items>
          <Item term="Get a copy">Email us and we will send what we hold about you within 30 days.</Item>
          <Item term="Fix it">
            Change your username, display name, photo, school, grade, main event, bio and email choice in Settings. For
            anything else, email us.
          </Item>
          <Item term="Delete it">
            Email us from the address on your account and ask us to delete it. We will delete the account and its records
            within 30 days and tell you when it's done.
          </Item>
          <Item term="Withdraw consent">
            You can stop using FBLC and ask for deletion at any time. Without an account the site can't save your
            practice.
          </Item>
          <Item term="Proving it's you">
            We may ask you to write from the email address on the account, so that only you can change or delete it.
          </Item>
        </Items>
      </LegalSection>

      <LegalSection {...S.minors}>
        <p>
          FBLC is for FBL Canada members, mostly students in grades 7 to 12, so many members are under 18. If you are under
          18, please go through this policy with a parent or guardian. If you are under 13, a parent or guardian needs to
          agree before you make an account.
        </p>
        <p>
          A parent or guardian can ask us for a copy of their child's information, or ask us to fix or delete it, by
          emailing <ContactEmail />. We will check that the request really comes from the member's family first.
        </p>
      </LegalSection>

      <LegalSection {...S.law}>
        <p>
          We follow the principles of Canada's Personal Information Protection and Electronic Documents Act (PIPEDA): we
          say why we collect each thing, ask for your consent when you sign up, collect only what the site needs, keep it
          safe, let you see and correct it, and keep it only as long as we need it. If you are unhappy with how we handled
          your information, please tell us first. You can also contact the Office of the Privacy Commissioner of Canada.
        </p>
      </LegalSection>

      <LegalSection {...S.changes}>
        <p>
          When this policy changes, we will update the date at the top, and for important changes we will tell members in
          the app before they take effect. The{' '}
          <Link className={PROSE_LINK} to="/terms">
            Terms of use
          </Link>{' '}
          go with this policy.
        </p>
      </LegalSection>

      <LegalSection {...S.lawyer}>
        <p>
          Two students wrote this policy to describe honestly what the site does. A lawyer has not reviewed it, and it is
          not legal advice.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
