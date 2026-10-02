// Internal implementation detail.
export function componentKey(component: string): string {
  return component
    .trim()
    .replace(/^view\//, '')
    .replace(/\.vue$/, '')
    .replace(/\/index$/, '');
}

export function pageRegistrationHint(component: string): string {
  return `pagemessage「${componentKey(component)}」message。message src/routes/pageRegistry.ts message registry addpagemessage lazy import message，menumanagementselectpage。`;
}
