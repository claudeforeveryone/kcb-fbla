"""End-to-end walk through every tab in on-device mode (?local), on a desktop and a phone viewport.
Usage: python tests/e2e/walk.py [base_url] [out_dir]"""
import sys, os, re
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'D:/gtmp/shots'
os.makedirs(OUT, exist_ok=True)
errors = []


def shot(page, name):
    page.screenshot(path=f'{OUT}/{name}.png', full_page=True)


def run(p, label, viewport, theme):
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport=viewport, color_scheme=theme)
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(f'[{label}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{label}] pageerror {e}'))

    page.goto(BASE + '/?local')
    page.wait_for_load_state('networkidle')
    # sign-up in local mode
    page.get_by_label('Name').fill('Joseph Test')
    page.get_by_role('button', name='Start').click()
    expect(page.get_by_role('heading', name='The FBLA Glass')).to_be_visible()
    page.wait_for_timeout(800)
    shot(page, f'{label}-board')

    # Play: practice three questions with feedback
    page.goto(BASE + '/play?local')
    expect(page.get_by_role('heading', name='Keep going')).to_be_visible()
    shot(page, f'{label}-play')
    page.get_by_role('button', name='Practice', exact=True).click()
    expect(page.get_by_text(re.compile(r'Question 1 of 20'))).to_be_visible()
    for i in range(3):
        page.locator('article ol button').first.click()
        expect(page.get_by_text(re.compile(r"^(Right\.|Not quite)"))).to_be_visible()
        if i == 0:
            shot(page, f'{label}-practice-feedback')
        page.get_by_role('button', name=re.compile('^Next')).click()
    page.get_by_role('button', name='End early').click()
    expect(page.get_by_role('heading', name='Review')).to_be_visible()
    shot(page, f'{label}-results')

    # Paper A: answer two, save & quit, then Keep going resumes it
    page.goto(BASE + '/play/run?kind=paper&topic=accounting&paper=A&local')
    expect(page.get_by_text('Question 1 of 50')).to_be_visible()
    page.locator('article ol button').nth(1).click()
    page.get_by_role('button', name=re.compile('^Next')).click()
    page.locator('article ol button').nth(2).click()
    shot(page, f'{label}-paper')
    page.get_by_role('button', name='Save & quit').click()
    expect(page.get_by_text('2 of 50 answered')).to_be_visible()
    page.get_by_role('link', name=re.compile('Continue')).click()
    expect(page.get_by_text('Question 2 of 50')).to_be_visible()
    page.locator('ol[aria-label="Jump to question"] button').last.click()
    page.get_by_role('button', name='Submit').click()
    expect(page.get_by_role('heading', name=re.compile('Submit with'))).to_be_visible()
    page.get_by_role('dialog').get_by_role('button', name='Submit').click()
    expect(page.get_by_role('heading', name=re.compile(r'^\d+ . 50$'))).to_be_visible()

    # Vocab: cards dashboard, then a 10-card match round
    page.goto(BASE + '/vocab?local')
    expect(page.get_by_role('heading', name='Today')).to_be_visible()
    page.get_by_role('button', name='10', exact=True).click()
    expect(page.get_by_role('button', name='Match 10 Cards')).to_be_visible()
    shot(page, f'{label}-vocab')
    page.get_by_role('button', name='Match 10 Cards').click()
    expect(page.get_by_text('Card 1 of 10')).to_be_visible()
    page.locator('ol button').first.click()
    shot(page, f'{label}-match')
    page.get_by_role('button', name='Next').click()
    expect(page.get_by_text('Card 2 of 10')).to_be_visible()

    # Flip round
    page.goto(BASE + '/vocab/study?mode=flip&deck=everything&topics=&n=10&local')
    page.get_by_role('button', name=re.compile('Flip to see')).click()
    page.wait_for_timeout(500)
    shot(page, f'{label}-flip')
    page.get_by_role('button', name='Got it').click()
    expect(page.get_by_text('Card 2 of 10')).to_be_visible()

    # Me
    page.goto(BASE + '/me?local')
    expect(page.get_by_text('Candidate Record · You')).to_be_visible()
    page.get_by_text('The whole ladder').click()
    shot(page, f'{label}-me')

    # Settings: choose an event, then readiness panel names it
    page.goto(BASE + '/settings?local')
    page.get_by_label('Event').select_option('accounting')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_text('Saved.')).to_be_visible()
    page.goto(BASE + '/me?local')
    expect(page.get_by_text('Exam readiness · ACCT')).to_be_visible()

    # My Words
    page.goto(BASE + '/vocab/words?local')
    page.get_by_label('Term').fill('Accrual')
    page.get_by_label('Definition').fill('Recording revenue when earned, not when cash arrives.')
    page.get_by_role('button', name='Add word').click()
    expect(page.get_by_text('Accrual', exact=True)).to_be_visible()
    shot(page, f'{label}-words')
    b.close()


with sync_playwright() as p:
    run(p, 'desktop', {'width': 1366, 'height': 900}, 'light')
    run(p, 'phone', {'width': 390, 'height': 844}, 'dark')

print('console errors:', len(errors))
for e in errors[:20]:
    print(' ', e)
print('WALK OK')

# cloud mode: with the chapter tables live, a fresh visitor lands on sign-in (not on-device mode)
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page()
    page.goto(BASE + '/')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible(timeout=15000)
    expect(page.get_by_role('button', name='Study on this device')).to_be_visible()
    page.screenshot(path=f'{OUT}/cloud-login.png')
    b.close()
print('CLOUD LOGIN OK')
