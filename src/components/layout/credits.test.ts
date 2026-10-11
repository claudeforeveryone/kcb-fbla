import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';
import { AuthLayout } from '../../pages/auth/AuthLayout';

const render = (el: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, el));

/** The credit paragraph or span, from "Built with" to "Kaden". */
function creditMarkup(html: string): string {
  const m = html.match(/Built with[\s\S]*?Kaden/);
  if (!m) throw new Error('no credit line in the render');
  return m[0];
}

/** What copy-paste, search snippets and plain-text readers get: tags dropped, entities decoded. */
const plainText = (markup: string) =>
  markup
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** What a screen reader reading the nodes in order announces: the icon's label stands in for the icon. */
const spokenText = (markup: string) =>
  plainText(markup.replace(/<svg[^>]*aria-label="([^"]*)"[\s\S]*?<\/svg>/g, '$1'));

describe('credit line', () => {
  const cases: Array<[string, ReactElement]> = [
    ['app footer', createElement(Footer)],
    ['sign-in and sign-up pages', createElement(AuthLayout, { title: 'Welcome back', children: 'form' })],
  ];

  it.each(cases)('%s keeps a space on both sides of the heart', (_, el) => {
    const credit = creditMarkup(render(el));
    expect(plainText(credit)).toBe('Built with by Joseph & Kaden');
    expect(spokenText(credit)).toBe('Built with love by Joseph & Kaden');
  });
});
