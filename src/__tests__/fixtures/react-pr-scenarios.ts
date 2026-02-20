/**
 * Fixtures de PRs reales y complejos para tests de integración.
 *
 * Tres escenarios que simulan dependencias cruzadas entre archivos React:
 *
 * PR #1 — Refactor AuthContext + useAuth hook + HOC PrivateRoute
 *   Impacto en: auth-flow, protected-routes, user-profile specs
 *
 * PR #2 — Migración de class component + HOF withPayment + Singleton PaymentService
 *   Impacto en: checkout-flow, payment-confirmation specs
 *
 * PR #3 — Cambio en ApiConfig Singleton + useFetch hook + UserList component
 *   Impacto en: user-list, user-detail, api-error specs
 */

import type { ASTChunk, PRMetadata, SpecFile, AnalyzeResult } from '../../types'

// ─── Helpers ──────────────────────────────────────────────

function hunk(added: string[], removed: string[] = []) {
  return {
    oldStart: 1,
    newStart: 1,
    lines: [
      ...removed.map((c) => ({ type: 'removed' as const, content: c, newLineNumber: null, oldLineNumber: 1 })),
      ...added.map((c) => ({ type: 'added' as const, content: c, newLineNumber: 1, oldLineNumber: null })),
    ],
  }
}

// ═══════════════════════════════════════════════════════════
// PR #1 — AuthContext refactor + useAuth hook + HOC
// ═══════════════════════════════════════════════════════════
// Escenario: el equipo migra el contexto de auth de una prop
// drilling simple a un reducer pattern. Cambian el shape del
// contexto, el hook que lo consume, y el HOC que protege rutas.
// Los tests de auth deben detectar el cambio de selectors.
// ═══════════════════════════════════════════════════════════

export const PR_AUTH_REFACTOR: PRMetadata = {
  prNumber: 101,
  title: 'refactor: migrate AuthContext to reducer pattern',
  description:
    'Replaces the simple isAuthenticated boolean with a full AuthState reducer. ' +
    'Updates useAuth hook return type and PrivateRoute HOC guard logic. ' +
    'Breaking: data-test-id attributes on auth buttons changed.',
  author: 'alice',
  branch: 'refactor/auth-context-reducer',
  commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  baseSha: '000000000000000000000000000000000000000',
  createdAt: '2024-03-01T10:00:00Z',
  mergedAt: null,
}

// Archivo 1: AuthContext.tsx — Context con reducer (deps: ninguna)
export const AUTH_CONTEXT_CHUNK: ASTChunk = {
  filename: 'src/contexts/AuthContext.tsx',
  rawDiff: [
    '-export const AuthContext = createContext<{ isAuthenticated: boolean; user: null | User }>({',
    '-  isAuthenticated: false, user: null',
    '-})',
    '+export type AuthState = {',
    '+  status: "idle" | "authenticated" | "unauthenticated" | "loading"',
    '+  user: User | null',
    '+  error: string | null',
    '+}',
    '+',
    '+type AuthAction =',
    '+  | { type: "LOGIN_SUCCESS"; payload: User }',
    '+  | { type: "LOGOUT" }',
    '+  | { type: "SET_LOADING" }',
    '+  | { type: "SET_ERROR"; payload: string }',
    '+',
    '+function authReducer(state: AuthState, action: AuthAction): AuthState {',
    '+  switch (action.type) {',
    '+    case "LOGIN_SUCCESS": return { status: "authenticated", user: action.payload, error: null }',
    '+    case "LOGOUT": return { status: "unauthenticated", user: null, error: null }',
    '+    case "SET_LOADING": return { ...state, status: "loading" }',
    '+    case "SET_ERROR": return { ...state, status: "unauthenticated", error: action.payload }',
    '+    default: return state',
    '+  }',
    '+}',
    '+',
    '+export const AuthContext = createContext<{',
    '+  state: AuthState',
    '+  dispatch: Dispatch<AuthAction>',
    '+} | null>(null)',
  ].join('\n'),
  hunks: [hunk(
    [
      'export type AuthState = { status: "idle" | "authenticated" | "unauthenticated" | "loading"; user: User | null; error: string | null }',
      'export const AuthContext = createContext<{ state: AuthState; dispatch: Dispatch<AuthAction> } | null>(null)',
    ],
    [
      'export const AuthContext = createContext<{ isAuthenticated: boolean; user: null | User }>({ isAuthenticated: false, user: null })',
    ]
  )],
  components: ['AuthContext', 'AuthProvider'],
  functions: ['authReducer', 'useReducer'],
  jsxChanges: [
    { element: 'button', attribute: 'data-test-id', addedValue: 'auth-logout-btn', removedValue: 'logout-button' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'auth-error-msg', removedValue: undefined },
  ],
  testIds: ['auth-logout-btn', 'auth-error-msg', 'logout-button'],
  summary: 'AuthContext migrated from simple boolean to full reducer pattern with AuthState type. data-test-id "logout-button" renamed to "auth-logout-btn".',
}

// Archivo 2: useAuth.ts — Hook que consume el context (deps: AuthContext)
export const USE_AUTH_HOOK_CHUNK: ASTChunk = {
  filename: 'src/hooks/useAuth.ts',
  rawDiff: [
    '-export function useAuth() {',
    '-  const ctx = useContext(AuthContext)',
    '-  return { isAuthenticated: ctx.isAuthenticated, user: ctx.user }',
    '-}',
    '+export function useAuth() {',
    '+  const ctx = useContext(AuthContext)',
    '+  if (!ctx) throw new Error("useAuth must be used within AuthProvider")',
    '+  return {',
    '+    isAuthenticated: ctx.state.status === "authenticated",',
    '+    isLoading: ctx.state.status === "loading",',
    '+    user: ctx.state.user,',
    '+    error: ctx.state.error,',
    '+    logout: () => ctx.dispatch({ type: "LOGOUT" }),',
    '+    login: (user: User) => ctx.dispatch({ type: "LOGIN_SUCCESS", payload: user }),',
    '+  }',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    ['isAuthenticated: ctx.state.status === "authenticated"', 'isLoading: ctx.state.status === "loading"'],
    ['isAuthenticated: ctx.isAuthenticated']
  )],
  components: [],
  functions: ['useAuth', 'useContext'],
  jsxChanges: [],
  testIds: [],
  summary: 'useAuth hook updated to consume new AuthState shape. Now returns isLoading, error, and dispatch-based logout/login helpers.',
}

// Archivo 3: PrivateRoute.tsx — HOC que usa useAuth (deps: useAuth → AuthContext)
export const PRIVATE_ROUTE_HOC_CHUNK: ASTChunk = {
  filename: 'src/components/PrivateRoute.tsx',
  rawDiff: [
    '-export function PrivateRoute({ children }: { children: ReactNode }) {',
    '-  const { isAuthenticated } = useAuth()',
    '-  if (!isAuthenticated) return <Navigate to="/login" />',
    '-  return <>{children}</>',
    '-}',
    '+export function PrivateRoute({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {',
    '+  const { isAuthenticated, isLoading } = useAuth()',
    '+  if (isLoading) return <div data-test-id="auth-loading-spinner">Loading...</div>',
    '+  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} />',
    '+  return <>{children}</>',
    '+}',
    '+',
    '+export function withAuth<P extends object>(Component: ComponentType<P>) {',
    '+  return function AuthenticatedComponent(props: P) {',
    '+    return <PrivateRoute><Component {...props} /></PrivateRoute>',
    '+  }',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    [
      'const { isAuthenticated, isLoading } = useAuth()',
      '<div data-test-id="auth-loading-spinner">Loading...</div>',
      'export function withAuth<P extends object>(Component: ComponentType<P>)',
    ],
    ['const { isAuthenticated } = useAuth()']
  )],
  components: ['PrivateRoute', 'AuthenticatedComponent'],
  functions: ['withAuth', 'useAuth'],
  jsxChanges: [
    { element: 'div', attribute: 'data-test-id', addedValue: 'auth-loading-spinner' },
  ],
  testIds: ['auth-loading-spinner'],
  summary: 'PrivateRoute HOC updated: added isLoading guard with spinner, location state for redirect. Added withAuth HOF factory.',
}

// Specs de E2E afectados por PR #1
export const AUTH_SPEC_FILES: SpecFile[] = [
  {
    name: 'auth-flow.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Authentication flow', () => {
  test('should redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })

  test('should show loading spinner during auth check', async ({ page }) => {
    await page.goto('/dashboard')
    const spinner = page.getByTestId('auth-loading-spinner')
    await expect(spinner).toBeVisible()
  })

  test('should display error message on login failure', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('bad@test.com')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByTestId('auth-error-msg')).toBeVisible()
  })

  test('should logout successfully via auth-logout-btn', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByTestId('auth-logout-btn').click()
    await expect(page).toHaveURL('/login')
  })

  test('should NOT find logout-button (old selector)', async ({ page }) => {
    // This test uses the old selector and will break
    await page.goto('/dashboard')
    await page.getByTestId('logout-button').click()
    await expect(page).toHaveURL('/login')
  })
})
    `.trim(),
  },
  {
    name: 'protected-routes.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Protected routes', () => {
  test('should redirect /profile to /login if not authenticated', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL('/login')
    await expect(page.url()).toContain('from=%2Fprofile')
  })

  test('should preserve redirect location after login', async ({ page }) => {
    await page.goto('/profile')
    await page.getByLabel('Email').fill('user@test.com')
    await page.getByLabel('Password').fill('correct')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/profile')
  })

  test('should show auth-loading-spinner while checking session', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByTestId('auth-loading-spinner')).toBeVisible()
  })
})
    `.trim(),
  },
  {
    name: 'user-profile.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('User profile', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('should display user name from auth context', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Alice' })).toBeVisible()
  })

  test('should allow logout from profile page', async ({ page }) => {
    await page.goto('/profile')
    await page.getByTestId('auth-logout-btn').click()
    await expect(page).toHaveURL('/login')
  })
})
    `.trim(),
  },
]

export const AUTH_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should NOT find logout-button (old selector)',
    file: 'auth-flow.spec.ts',
    line: 0,
    status: 'broken',
    reason: 'data-test-id "logout-button" was renamed to "auth-logout-btn" in AuthContext.tsx',
  },
  {
    test: 'should show loading spinner during auth check',
    file: 'auth-flow.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'auth-loading-spinner now exists in PrivateRoute HOC — selector works',
  },
  {
    test: 'should display error message on login failure',
    file: 'auth-flow.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'auth-error-msg added to AuthContext — selector works',
  },
  {
    test: 'should preserve redirect location after login',
    file: 'protected-routes.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'PrivateRoute now passes location state — URL might contain extra query params',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #2 — Class → Functional migration + HOF withPayment + Singleton
// ═══════════════════════════════════════════════════════════
// Escenario: migración de un class component legacy a functional.
// El PaymentService es un singleton que maneja el estado global
// del checkout. El HOF withPayment inyecta las props del servicio.
// ═══════════════════════════════════════════════════════════

export const PR_PAYMENT_MIGRATION: PRMetadata = {
  prNumber: 102,
  title: 'feat: migrate PaymentForm class component to functional + redesign',
  description:
    'Replaces the PaymentForm class component with a functional one using hooks. ' +
    'PaymentService singleton now exposes a reactive hook via useSyncExternalStore. ' +
    'data-test-id changes: "submit-payment" → "payment-submit-btn", ' +
    '"payment-error" → "payment-error-banner".',
  author: 'bob',
  branch: 'feat/payment-form-functional',
  commitSha: 'b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3',
  baseSha: '111111111111111111111111111111111111111',
  createdAt: '2024-03-15T14:00:00Z',
  mergedAt: null,
}

// Archivo 1: PaymentService.ts — Singleton (deps: ninguna)
export const PAYMENT_SERVICE_CHUNK: ASTChunk = {
  filename: 'src/services/PaymentService.ts',
  rawDiff: [
    '-class PaymentServiceClass {',
    '-  private state = { isProcessing: false, error: null as string | null }',
    '-  async processPayment(amount: number): Promise<void> {',
    '-    this.state.isProcessing = true',
    '-  }',
    '-}',
    '-export const PaymentService = new PaymentServiceClass()',
    '+type PaymentState = { isProcessing: boolean; lastError: string | null; transactionId: string | null }',
    '+',
    '+const initialState: PaymentState = { isProcessing: false, lastError: null, transactionId: null }',
    '+',
    '+class PaymentServiceSingleton {',
    '+  private static instance: PaymentServiceSingleton',
    '+  private state: PaymentState = { ...initialState }',
    '+  private listeners = new Set<() => void>()',
    '+',
    '+  static getInstance(): PaymentServiceSingleton {',
    '+    if (!PaymentServiceSingleton.instance) {',
    '+      PaymentServiceSingleton.instance = new PaymentServiceSingleton()',
    '+    }',
    '+    return PaymentServiceSingleton.instance',
    '+  }',
    '+',
    '+  subscribe(listener: () => void): () => void {',
    '+    this.listeners.add(listener)',
    '+    return () => this.listeners.delete(listener)',
    '+  }',
    '+',
    '+  getSnapshot(): PaymentState { return this.state }',
    '+',
    '+  async processPayment(amount: number, currency = "USD"): Promise<string> {',
    '+    this.setState({ isProcessing: true, lastError: null, transactionId: null })',
    '+    const txId = await this.callAPI(amount, currency)',
    '+    this.setState({ isProcessing: false, transactionId: txId })',
    '+    return txId',
    '+  }',
    '+',
    '+  private setState(partial: Partial<PaymentState>) {',
    '+    this.state = { ...this.state, ...partial }',
    '+    this.listeners.forEach((l) => l())',
    '+  }',
    '+',
    '+  private async callAPI(amount: number, currency: string): Promise<string> {',
    '+    const res = await fetch("/api/payments", { method: "POST", body: JSON.stringify({ amount, currency }) })',
    '+    if (!res.ok) { this.setState({ lastError: "Payment failed" }); throw new Error("Payment failed") }',
    '+    return (await res.json() as { txId: string }).txId',
    '+  }',
    '+}',
    '+',
    '+export const PaymentService = PaymentServiceSingleton.getInstance()',
  ].join('\n'),
  hunks: [hunk(
    ['static getInstance(): PaymentServiceSingleton', 'subscribe(listener: () => void): () => void', 'getSnapshot(): PaymentState'],
    ['class PaymentServiceClass {', 'private state = { isProcessing: false }']
  )],
  components: [],
  functions: ['getInstance', 'subscribe', 'getSnapshot', 'processPayment', 'setState'],
  jsxChanges: [],
  testIds: [],
  summary: 'PaymentService refactored from simple class to proper Singleton with useSyncExternalStore-compatible subscribe/getSnapshot API.',
}

// Archivo 2: withPayment.tsx — HOF que inyecta el servicio (deps: PaymentService)
export const WITH_PAYMENT_HOF_CHUNK: ASTChunk = {
  filename: 'src/hocs/withPayment.tsx',
  rawDiff: [
    '-export function withPayment<P extends { onPayment: (amount: number) => void }>(Component: ComponentType<P>) {',
    '-  return function WithPaymentComponent(props: Omit<P, "onPayment">) {',
    '-    const handlePayment = (amount: number) => PaymentService.processPayment(amount)',
    '-    return <Component {...(props as P)} onPayment={handlePayment} />',
    '-  }',
    '-}',
    '+export type PaymentInjectedProps = {',
    '+  onPayment: (amount: number, currency?: string) => Promise<string>',
    '+  paymentState: PaymentState',
    '+}',
    '+',
    '+export function withPayment<P extends PaymentInjectedProps>(Component: ComponentType<P>) {',
    '+  function WithPaymentComponent(props: Omit<P, keyof PaymentInjectedProps>) {',
    '+    const paymentState = useSyncExternalStore(',
    '+      PaymentService.subscribe.bind(PaymentService),',
    '+      PaymentService.getSnapshot.bind(PaymentService)',
    '+    )',
    '+    const onPayment = useCallback(',
    '+      (amount: number, currency = "USD") => PaymentService.processPayment(amount, currency),',
    '+      []',
    '+    )',
    '+    return <Component {...(props as P)} onPayment={onPayment} paymentState={paymentState} />',
    '+  }',
    '+  WithPaymentComponent.displayName = `withPayment(${Component.displayName ?? Component.name})`',
    '+  return WithPaymentComponent',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    ['const paymentState = useSyncExternalStore(PaymentService.subscribe.bind(PaymentService), PaymentService.getSnapshot.bind(PaymentService))', 'WithPaymentComponent.displayName = `withPayment(${Component.displayName ?? Component.name})`'],
    ['const handlePayment = (amount: number) => PaymentService.processPayment(amount)']
  )],
  components: ['WithPaymentComponent'],
  functions: ['withPayment', 'useSyncExternalStore', 'useCallback'],
  jsxChanges: [],
  testIds: [],
  summary: 'withPayment HOF upgraded: now uses useSyncExternalStore for reactive payment state. Injects paymentState prop into wrapped component.',
}

// Archivo 3: PaymentForm.tsx — Class component migrado a functional (deps: withPayment, PaymentService)
export const PAYMENT_FORM_CHUNK: ASTChunk = {
  filename: 'src/components/PaymentForm.tsx',
  rawDiff: [
    '-class PaymentForm extends React.Component<PaymentFormProps, { amount: string }> {',
    '-  state = { amount: "" }',
    '-  handleSubmit = async (e: FormEvent) => {',
    '-    e.preventDefault()',
    '-    await this.props.onPayment(parseFloat(this.state.amount))',
    '-  }',
    '-  render() {',
    '-    return (',
    '-      <form data-test-id="payment-form" onSubmit={this.handleSubmit}>',
    '-        <input data-test-id="amount-input" value={this.state.amount} onChange={(e) => this.setState({ amount: e.target.value })} />',
    '-        <button data-test-id="submit-payment" type="submit">Pay</button>',
    '-        {this.props.error && <div data-test-id="payment-error">{this.props.error}</div>}',
    '-      </form>',
    '-    )',
    '-  }',
    '-}',
    '+function PaymentFormBase({ onPayment, paymentState }: PaymentInjectedProps & { className?: string }) {',
    '+  const [amount, setAmount] = useState("")',
    '+  const [currency, setCurrency] = useState("USD")',
    '+',
    '+  const handleSubmit = async (e: FormEvent) => {',
    '+    e.preventDefault()',
    '+    await onPayment(parseFloat(amount), currency)',
    '+  }',
    '+',
    '+  return (',
    '+    <form data-test-id="payment-form" onSubmit={handleSubmit}>',
    '+      <input data-test-id="amount-input" value={amount} onChange={(e) => setAmount(e.target.value)} />',
    '+      <select data-test-id="currency-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>',
    '+        <option value="USD">USD</option>',
    '+        <option value="EUR">EUR</option>',
    '+      </select>',
    '+      <button data-test-id="payment-submit-btn" type="submit" disabled={paymentState.isProcessing}>',
    '+        {paymentState.isProcessing ? "Processing..." : "Pay"}',
    '+      </button>',
    '+      {paymentState.lastError && <div data-test-id="payment-error-banner">{paymentState.lastError}</div>}',
    '+    </form>',
    '+  )',
    '+}',
    '+export const PaymentForm = withPayment(PaymentFormBase)',
  ].join('\n'),
  hunks: [hunk(
    [
      '<button data-test-id="payment-submit-btn" type="submit">Pay</button>',
      '<div data-test-id="payment-error-banner">{paymentState.lastError}</div>',
      '<select data-test-id="currency-select">',
    ],
    [
      '<button data-test-id="submit-payment" type="submit">Pay</button>',
      '<div data-test-id="payment-error">{this.props.error}</div>',
    ]
  )],
  components: ['PaymentFormBase', 'PaymentForm'],
  functions: ['handleSubmit', 'useState', 'withPayment'],
  jsxChanges: [
    { element: 'button', attribute: 'data-test-id', addedValue: 'payment-submit-btn', removedValue: 'submit-payment' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'payment-error-banner', removedValue: 'payment-error' },
    { element: 'select', attribute: 'data-test-id', addedValue: 'currency-select' },
  ],
  testIds: ['payment-submit-btn', 'payment-error-banner', 'currency-select', 'submit-payment', 'payment-error'],
  summary: 'PaymentForm migrated from class component to functional. "submit-payment" → "payment-submit-btn", "payment-error" → "payment-error-banner". Added currency-select. Wrapped with withPayment HOF.',
}

export const PAYMENT_SPEC_FILES: SpecFile[] = [
  {
    name: 'checkout-flow.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Checkout flow', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('should complete a full USD payment', async ({ page }) => {
    await page.goto('/checkout')
    await page.getByTestId('amount-input').fill('99.99')
    await page.getByTestId('payment-submit-btn').click()
    await expect(page.getByTestId('payment-success')).toBeVisible()
  })

  test('should fail with old submit-payment selector', async ({ page }) => {
    await page.goto('/checkout')
    await page.getByTestId('submit-payment').click()
  })

  test('should select EUR currency', async ({ page }) => {
    await page.goto('/checkout')
    await page.getByTestId('currency-select').selectOption('EUR')
    await expect(page.getByTestId('currency-select')).toHaveValue('EUR')
  })

  test('should disable submit button while processing', async ({ page }) => {
    await page.goto('/checkout')
    await page.getByTestId('amount-input').fill('50.00')
    await page.getByTestId('payment-submit-btn').click()
    await expect(page.getByTestId('payment-submit-btn')).toBeDisabled()
  })
})
    `.trim(),
  },
  {
    name: 'payment-confirmation.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Payment confirmation', () => {
  test('should show payment-error-banner on failed payment', async ({ page }) => {
    await page.goto('/checkout')
    await page.getByTestId('amount-input').fill('-1')
    await page.getByTestId('payment-submit-btn').click()
    await expect(page.getByTestId('payment-error-banner')).toBeVisible()
  })

  test('should NOT find payment-error (old selector)', async ({ page }) => {
    await page.goto('/checkout')
    await page.getByTestId('payment-error').waitFor()
  })

  test('should show transaction ID after success', async ({ page }) => {
    await page.goto('/checkout')
    await page.getByTestId('amount-input').fill('10.00')
    await page.getByTestId('payment-submit-btn').click()
    await expect(page.getByTestId('transaction-id')).toBeVisible()
  })
})
    `.trim(),
  },
]

export const PAYMENT_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should fail with old submit-payment selector',
    file: 'checkout-flow.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"submit-payment" renamed to "payment-submit-btn" in PaymentForm migration',
  },
  {
    test: 'should NOT find payment-error (old selector)',
    file: 'payment-confirmation.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"payment-error" renamed to "payment-error-banner" in PaymentForm migration',
  },
  {
    test: 'should complete a full USD payment',
    file: 'checkout-flow.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'payment-submit-btn is the new correct selector',
  },
  {
    test: 'should select EUR currency',
    file: 'checkout-flow.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'currency-select is a new element — test now possible',
  },
  {
    test: 'should disable submit button while processing',
    file: 'checkout-flow.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'Depends on paymentState.isProcessing from singleton — timing may vary',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #3 — ApiConfig Singleton + useFetch hook + UserList component
// ═══════════════════════════════════════════════════════════
// Escenario: el singleton de configuración de API cambia el
// base URL y agrega headers de versión. El hook useFetch
// lo consume. UserList usa useFetch. Varios tests afectados.
// ═══════════════════════════════════════════════════════════

export const PR_API_CONFIG: PRMetadata = {
  prNumber: 103,
  title: 'feat: add API versioning and request retry to ApiConfig singleton',
  description:
    'ApiConfig singleton now supports API versioning via X-API-Version header. ' +
    'useFetch hook gains retry logic and exposes isRetrying state. ' +
    'UserList now shows a retry button: data-test-id "retry-fetch-btn".',
  author: 'carol',
  branch: 'feat/api-versioning',
  commitSha: 'c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4',
  baseSha: '222222222222222222222222222222222222222',
  createdAt: '2024-03-20T09:00:00Z',
  mergedAt: '2024-03-21T16:00:00Z',
}

// Archivo 1: ApiConfig.ts — Singleton global (deps: ninguna)
export const API_CONFIG_CHUNK: ASTChunk = {
  filename: 'src/config/ApiConfig.ts',
  rawDiff: [
    '-class ApiConfigSingleton {',
    '-  readonly baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"',
    '-  getHeaders() { return { "Content-Type": "application/json" } }',
    '-}',
    '+class ApiConfigSingleton {',
    '+  private static _instance: ApiConfigSingleton',
    '+  readonly baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"',
    '+  readonly apiVersion = process.env.NEXT_PUBLIC_API_VERSION ?? "v1"',
    '+  readonly maxRetries = parseInt(process.env.NEXT_PUBLIC_MAX_RETRIES ?? "3", 10)',
    '+',
    '+  static get instance(): ApiConfigSingleton {',
    '+    return (ApiConfigSingleton._instance ??= new ApiConfigSingleton())',
    '+  }',
    '+',
    '+  getHeaders(): Record<string, string> {',
    '+    return {',
    '+      "Content-Type": "application/json",',
    '+      "X-API-Version": this.apiVersion,',
    '+      "X-Request-ID": crypto.randomUUID(),',
    '+    }',
    '+  }',
    '+',
    '+  buildUrl(path: string): string {',
    '+    return `${this.baseUrl}/${this.apiVersion}${path}`',
    '+  }',
    '+}',
    '+export const ApiConfig = ApiConfigSingleton.instance',
  ].join('\n'),
  hunks: [hunk(
    ['readonly apiVersion = process.env.NEXT_PUBLIC_API_VERSION ?? "v1"', '"X-API-Version": this.apiVersion', 'buildUrl(path: string): string'],
    ['readonly baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"', 'getHeaders() { return { "Content-Type": "application/json" } }']
  )],
  components: [],
  functions: ['getHeaders', 'buildUrl', 'get instance'],
  jsxChanges: [],
  testIds: [],
  summary: 'ApiConfig singleton adds API versioning (X-API-Version header), request ID (X-Request-ID), retry config, and buildUrl helper. All URLs now include version prefix.',
}

// Archivo 2: useFetch.ts — Hook que usa ApiConfig (deps: ApiConfig)
export const USE_FETCH_HOOK_CHUNK: ASTChunk = {
  filename: 'src/hooks/useFetch.ts',
  rawDiff: [
    '-export function useFetch<T>(path: string) {',
    '-  const [data, setData] = useState<T | null>(null)',
    '-  const [error, setError] = useState<string | null>(null)',
    '-  const [loading, setLoading] = useState(false)',
    '-  useEffect(() => {',
    '-    setLoading(true)',
    '-    fetch(`${ApiConfig.baseUrl}${path}`, { headers: ApiConfig.getHeaders() })',
    '-      .then((r) => r.json() as Promise<T>).then(setData)',
    '-      .catch((e) => setError(String(e))).finally(() => setLoading(false))',
    '-  }, [path])',
    '-  return { data, error, loading }',
    '-}',
    '+export function useFetch<T>(path: string, options: { retries?: number } = {}) {',
    '+  const [data, setData] = useState<T | null>(null)',
    '+  const [error, setError] = useState<string | null>(null)',
    '+  const [loading, setLoading] = useState(false)',
    '+  const [isRetrying, setIsRetrying] = useState(false)',
    '+  const [attempt, setAttempt] = useState(0)',
    '+  const maxRetries = options.retries ?? ApiConfig.maxRetries',
    '+',
    '+  const fetchWithRetry = useCallback(async (url: string, retryCount: number): Promise<T> => {',
    '+    try {',
    '+      const res = await fetch(url, { headers: ApiConfig.getHeaders() })',
    '+      if (!res.ok) throw new Error(`HTTP ${res.status}`)',
    '+      return res.json() as Promise<T>',
    '+    } catch (err) {',
    '+      if (retryCount < maxRetries) {',
    '+        setIsRetrying(true)',
    '+        await new Promise((r) => setTimeout(r, 1000 * 2 ** retryCount))',
    '+        return fetchWithRetry(url, retryCount + 1)',
    '+      }',
    '+      throw err',
    '+    }',
    '+  }, [maxRetries])',
    '+',
    '+  useEffect(() => {',
    '+    setLoading(true)',
    '+    setIsRetrying(false)',
    '+    fetchWithRetry(ApiConfig.buildUrl(path), 0)',
    '+      .then(setData).catch((e) => setError(String(e))).finally(() => { setLoading(false); setIsRetrying(false) })',
    '+  }, [path, attempt, fetchWithRetry])',
    '+',
    '+  const retry = useCallback(() => setAttempt((a) => a + 1), [])',
    '+  return { data, error, loading, isRetrying, retry }',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    ['const [isRetrying, setIsRetrying] = useState(false)', 'const fetchWithRetry = useCallback(async', 'ApiConfig.buildUrl(path)'],
    ['fetch(`${ApiConfig.baseUrl}${path}`', 'return { data, error, loading }']
  )],
  components: [],
  functions: ['useFetch', 'fetchWithRetry', 'useCallback', 'useEffect'],
  jsxChanges: [],
  testIds: [],
  summary: 'useFetch hook adds retry logic with exponential backoff, isRetrying state, and retry() function. URLs now built via ApiConfig.buildUrl (adds /v1 prefix).',
}

// Archivo 3: UserList.tsx — Component que usa useFetch (deps: useFetch → ApiConfig)
export const USER_LIST_CHUNK: ASTChunk = {
  filename: 'src/components/UserList.tsx',
  rawDiff: [
    '-export function UserList() {',
    '-  const { data: users, error, loading } = useFetch<User[]>("/users")',
    '-  if (loading) return <div data-test-id="user-list-loading">Loading...</div>',
    '-  if (error) return <div data-test-id="user-list-error">{error}</div>',
    '-  return (',
    '-    <ul data-test-id="user-list">',
    '-      {users?.map((u) => <li key={u.id} data-test-id={`user-item-${u.id}`}>{u.name}</li>)}',
    '-    </ul>',
    '-  )',
    '-}',
    '+export function UserList() {',
    '+  const { data: users, error, loading, isRetrying, retry } = useFetch<User[]>("/users")',
    '+  if (loading || isRetrying) return (',
    '+    <div data-test-id="user-list-loading">',
    '+      {isRetrying ? "Retrying..." : "Loading..."}',
    '+    </div>',
    '+  )',
    '+  if (error) return (',
    '+    <div data-test-id="user-list-error">',
    '+      <span>{error}</span>',
    '+      <button data-test-id="retry-fetch-btn" onClick={retry}>Retry</button>',
    '+    </div>',
    '+  )',
    '+  return (',
    '+    <ul data-test-id="user-list">',
    '+      {users?.map((u) => <li key={u.id} data-test-id={`user-item-${u.id}`}>{u.name}</li>)}',
    '+    </ul>',
    '+  )',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    ['const { data: users, error, loading, isRetrying, retry } = useFetch<User[]>("/users")', '<button data-test-id="retry-fetch-btn" onClick={retry}>Retry</button>'],
    ['const { data: users, error, loading } = useFetch<User[]>("/users")']
  )],
  components: ['UserList'],
  functions: ['useFetch'],
  jsxChanges: [
    { element: 'button', attribute: 'data-test-id', addedValue: 'retry-fetch-btn' },
  ],
  testIds: ['retry-fetch-btn', 'user-list-loading', 'user-list-error', 'user-list'],
  summary: 'UserList now shows isRetrying state in loading div. Adds retry-fetch-btn button on error. API URL now includes /v1 prefix via ApiConfig.buildUrl.',
}

export const API_SPEC_FILES: SpecFile[] = [
  {
    name: 'user-list.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('User list', () => {
  test('should display list of users', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByTestId('user-list')).toBeVisible()
    await expect(page.getByTestId('user-item-1')).toBeVisible()
  })

  test('should show loading state', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByTestId('user-list-loading')).toBeVisible()
  })

  test('should show retry button on error', async ({ page }) => {
    await page.route('**/v1/users', (route) => route.abort())
    await page.goto('/users')
    await expect(page.getByTestId('retry-fetch-btn')).toBeVisible()
  })

  test('should retry on button click', async ({ page }) => {
    let callCount = 0
    await page.route('**/v1/users', (route) => {
      callCount++
      callCount < 2 ? route.abort() : route.continue()
    })
    await page.goto('/users')
    await page.getByTestId('retry-fetch-btn').click()
    await expect(page.getByTestId('user-list')).toBeVisible()
  })
})
    `.trim(),
  },
  {
    name: 'user-detail.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('User detail', () => {
  test('should load user via versioned API URL', async ({ page }) => {
    await page.route('**/v1/users/1', (route) => route.fulfill({ json: { id: 1, name: 'Alice' } }))
    await page.goto('/users/1')
    await expect(page.getByText('Alice')).toBeVisible()
  })

  test('should show error with retry button when API fails', async ({ page }) => {
    await page.route('**/v1/users/1', (route) => route.abort())
    await page.goto('/users/1')
    await expect(page.getByTestId('retry-fetch-btn')).toBeVisible()
    await expect(page.getByTestId('user-list-error')).toBeVisible()
  })
})
    `.trim(),
  },
  {
    name: 'api-error.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('API error handling', () => {
  test('should include X-API-Version header in requests', async ({ page }) => {
    const headers: Record<string, string> = {}
    await page.route('**/v1/**', (route) => {
      Object.assign(headers, route.request().headers())
      route.continue()
    })
    await page.goto('/users')
    await expect.poll(() => headers['x-api-version']).toBe('v1')
  })

  test('should show Retrying... text during retry', async ({ page }) => {
    await page.route('**/v1/users', (route) => route.abort())
    await page.goto('/users')
    await page.getByTestId('retry-fetch-btn').click()
    await expect(page.getByText('Retrying...')).toBeVisible()
  })
})
    `.trim(),
  },
]

export const API_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should show retry button on error',
    file: 'user-list.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'retry-fetch-btn is a new element added in this PR',
  },
  {
    test: 'should retry on button click',
    file: 'user-list.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'Depends on retry() from useFetch updating attempt state — async timing sensitive',
  },
  {
    test: 'should load user via versioned API URL',
    file: 'user-detail.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'URL changed from /users/1 to /v1/users/1 — route mocks must match new pattern',
  },
  {
    test: 'should include X-API-Version header in requests',
    file: 'api-error.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'X-API-Version header now added by ApiConfig.getHeaders()',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #4 — TanStack Query v5: query key factory + optimistic updates
// ═══════════════════════════════════════════════════════════
// Escenario: el equipo migra el data fetching de useFetch custom
// a TanStack Query. Se centraliza la estructura de query keys en
// una factory tipada. useAddToCartMutation gana optimistic updates
// con rollback automático. ProductCard cambia sus loading/error UIs.
// ═══════════════════════════════════════════════════════════

export const PR_TANSTACK_QUERY: PRMetadata = {
  prNumber: 104,
  title: 'feat: migrate data fetching to TanStack Query v5 with optimistic cart',
  description:
    'Migrates product data fetching from custom useFetch to TanStack Query useQuery. ' +
    'Centralizes query keys in typed factory (queryKeys.ts). ' +
    'useAddToCartMutation adds optimistic updates with rollback on error. ' +
    'data-test-id: "loading-spinner"→"product-loading-skeleton", "product-error"→"product-error-banner".',
  author: 'dan',
  branch: 'feat/tanstack-query-v5',
  commitSha: 'd4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5',
  baseSha: '333333333333333333333333333333333333333',
  createdAt: '2024-04-01T10:00:00Z',
  mergedAt: null,
}

// Archivo 1: queryKeys.ts — Factory centralizada de query keys (deps: ninguna)
export const QUERY_KEYS_CHUNK: ASTChunk = {
  filename: 'src/lib/queryKeys.ts',
  rawDiff: [
    '-export const QUERY_KEYS = {',
    '-  product: (id: number) => ["product", id],',
    '-  cart: ["cart"],',
    '-  orders: ["orders"],',
    '-}',
    '+export const queryKeys = {',
    '+  products: {',
    '+    all: () => ["products"] as const,',
    '+    list: (filters?: ProductFilters) => ["products", "list", filters] as const,',
    '+    detail: (id: number) => ["products", "detail", id] as const,',
    '+  },',
    '+  cart: {',
    '+    all: () => ["cart"] as const,',
    '+    items: () => ["cart", "items"] as const,',
    '+  },',
    '+  orders: {',
    '+    all: () => ["orders"] as const,',
    '+    byUser: (userId: string) => ["orders", "byUser", userId] as const,',
    '+  },',
    '+} satisfies Record<string, Record<string, (...args: unknown[]) => readonly unknown[]>>',
  ].join('\n'),
  hunks: [hunk(
    [
      'queryKeys.products.detail: (id) => ["products", "detail", id] as const',
      'queryKeys.cart.items: () => ["cart", "items"] as const',
      'satisfies Record<string, Record<string, (...args: unknown[]) => readonly unknown[]>>',
    ],
    [
      'QUERY_KEYS.product: (id) => ["product", id]',
      'QUERY_KEYS.cart: ["cart"]',
    ]
  )],
  components: [],
  functions: ['queryKeys'],
  jsxChanges: [],
  testIds: [],
  summary: 'Query key factory renamed QUERY_KEYS→queryKeys. Structure changed: "product"→"products.detail", "cart"→"cart.items". All keys typed as const with satisfies guard for type safety.',
}

// Archivo 2: useProductQuery.ts — Hooks de TanStack Query (deps: queryKeys)
export const USE_PRODUCT_QUERY_CHUNK: ASTChunk = {
  filename: 'src/hooks/useProductQuery.ts',
  rawDiff: [
    '-import { useQuery, useMutation } from "@tanstack/react-query"',
    '-import { QUERY_KEYS } from "@/lib/queryKeys"',
    '+import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"',
    '+import { queryKeys } from "@/lib/queryKeys"',
    '',
    '-export function useProductQuery(id: number) {',
    '-  return useQuery({ queryKey: QUERY_KEYS.product(id), queryFn: () => fetchProduct(id) })',
    '-}',
    '+export function useProductQuery(id: number) {',
    '+  return useQuery({',
    '+    queryKey: queryKeys.products.detail(id),',
    '+    queryFn: () => fetchProduct(id),',
    '+    staleTime: 5 * 60 * 1000,',
    '+    retry: 2,',
    '+  })',
    '+}',
    '',
    '-export function useAddToCartMutation() {',
    '-  return useMutation({ mutationFn: addToCart })',
    '-}',
    '+export function useAddToCartMutation() {',
    '+  const qc = useQueryClient()',
    '+  return useMutation({',
    '+    mutationFn: addToCart,',
    '+    onMutate: async (item) => {',
    '+      await qc.cancelQueries({ queryKey: queryKeys.cart.items() })',
    '+      const prev = qc.getQueryData(queryKeys.cart.items())',
    '+      qc.setQueryData(queryKeys.cart.items(), (old: CartItem[] = []) => [...old, item])',
    '+      return { prev }',
    '+    },',
    '+    onError: (_err, _item, ctx) => qc.setQueryData(queryKeys.cart.items(), ctx?.prev),',
    '+    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.cart.all() }),',
    '+  })',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    [
      'queryKeys.products.detail(id)',
      'staleTime: 5 * 60 * 1000',
      'onMutate: async (item) => {',
      'qc.invalidateQueries({ queryKey: queryKeys.cart.all() })',
    ],
    [
      'QUERY_KEYS.product(id)',
      'useMutation({ mutationFn: addToCart })',
    ]
  )],
  components: [],
  functions: ['useProductQuery', 'useAddToCartMutation', 'useQueryClient', 'useQuery', 'useMutation'],
  jsxChanges: [],
  testIds: [],
  summary: 'useProductQuery migrated to queryKeys factory, adds staleTime 5min and retry 2. useAddToCartMutation gains optimistic update with rollback on error and cache invalidation via queryKeys.cart.',
}

// Archivo 3: ProductCard.tsx — Component usando TanStack Query (deps: useProductQuery)
export const PRODUCT_CARD_CHUNK: ASTChunk = {
  filename: 'src/components/ProductCard.tsx',
  rawDiff: [
    '-  if (isLoading) return <div data-test-id="loading-spinner">Loading...</div>',
    '-  if (error) return <div data-test-id="product-error">Error: {error.message}</div>',
    '+  if (isLoading) return (',
    '+    <div data-test-id="product-loading-skeleton" aria-busy="true">',
    '+      <div className="animate-pulse h-4 w-full bg-muted rounded" />',
    '+      <div className="animate-pulse h-4 w-2/3 bg-muted rounded mt-2" />',
    '+    </div>',
    '+  )',
    '+  if (isError) return (',
    '+    <div data-test-id="product-error-banner" role="alert">',
    '+      <span>{error.message}</span>',
    '+      <button data-test-id="product-error-retry" onClick={() => refetch()}>Retry</button>',
    '+    </div>',
    '+  )',
    '   // cart mutation feedback:',
    '+  {addToCart.isSuccess && <div data-test-id="cart-success-toast">Added to cart!</div>}',
    '+  <button data-test-id="add-to-cart-btn" disabled={addToCart.isPending}',
    '+    onClick={() => addToCart.mutate({ id, qty: 1 })}',
    '+  >',
    '+    {addToCart.isPending ? "Adding..." : "Add to cart"}',
    '+  </button>',
  ].join('\n'),
  hunks: [hunk(
    [
      '<div data-test-id="product-loading-skeleton" aria-busy="true">',
      '<div data-test-id="product-error-banner" role="alert">',
      '<button data-test-id="product-error-retry">Retry</button>',
      '<div data-test-id="cart-success-toast">Added to cart!</div>',
    ],
    [
      '<div data-test-id="loading-spinner">Loading...</div>',
      '<div data-test-id="product-error">Error: {error.message}</div>',
    ]
  )],
  components: ['ProductCard'],
  functions: ['useProductQuery', 'useAddToCartMutation'],
  jsxChanges: [
    { element: 'div', attribute: 'data-test-id', addedValue: 'product-loading-skeleton', removedValue: 'loading-spinner' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'product-error-banner', removedValue: 'product-error' },
    { element: 'button', attribute: 'data-test-id', addedValue: 'product-error-retry' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'cart-success-toast' },
  ],
  testIds: ['product-loading-skeleton', 'product-error-banner', 'product-error-retry', 'cart-success-toast', 'loading-spinner', 'product-error', 'add-to-cart-btn'],
  summary: 'ProductCard loading UI: "loading-spinner"→"product-loading-skeleton" (skeleton pattern). Error UI: "product-error"→"product-error-banner" + retry button. cart-success-toast added for mutation feedback.',
}

export const TANSTACK_SPEC_FILES: SpecFile[] = [
  {
    name: 'product-card.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('ProductCard — TanStack Query', () => {
  test('should show loading-spinner while fetching', async ({ page }) => {
    await page.goto('/products/1')
    await expect(page.getByTestId('loading-spinner')).toBeVisible()
  })

  test('should show product-loading-skeleton (new skeleton UI)', async ({ page }) => {
    await page.goto('/products/1')
    await expect(page.getByTestId('product-loading-skeleton')).toBeVisible()
  })

  test('should show product-error-banner on fetch failure', async ({ page }) => {
    await page.route('**/products/detail/1', (route) => route.abort())
    await page.goto('/products/1')
    await expect(page.getByTestId('product-error-banner')).toBeVisible()
  })

  test('should NOT find product-error div (old selector)', async ({ page }) => {
    await page.route('**/products/detail/1', (route) => route.abort())
    await page.goto('/products/1')
    await expect(page.getByTestId('product-error')).toBeVisible()
  })

  test('should retry via product-error-retry button', async ({ page }) => {
    let calls = 0
    await page.route('**/products/detail/1', (route) => {
      calls++ < 1 ? route.abort() : route.continue()
    })
    await page.goto('/products/1')
    await page.getByTestId('product-error-retry').click()
    await expect(page.getByTestId('product-card')).toBeVisible()
  })
})
    `.trim(),
  },
  {
    name: 'cart-optimistic.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Cart — TanStack Query optimistic updates', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('should show cart-success-toast after adding product', async ({ page }) => {
    await page.goto('/products/1')
    await page.getByTestId('add-to-cart-btn').click()
    await expect(page.getByTestId('cart-success-toast')).toBeVisible()
  })

  test('should disable add-to-cart-btn while mutation is pending', async ({ page }) => {
    await page.route('**/api/cart', async (route) => {
      await new Promise((r) => setTimeout(r, 500))
      await route.continue()
    })
    await page.goto('/products/1')
    await page.getByTestId('add-to-cart-btn').click()
    await expect(page.getByTestId('add-to-cart-btn')).toBeDisabled()
  })

  test('should rollback cart on mutation error', async ({ page }) => {
    await page.route('**/api/cart', (route) => route.abort())
    await page.goto('/products/1')
    const cartCount = await page.getByTestId('cart-count').textContent()
    await page.getByTestId('add-to-cart-btn').click()
    await expect(page.getByTestId('cart-count')).toHaveText(cartCount ?? '0')
  })
})
    `.trim(),
  },
]

export const TANSTACK_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should show loading-spinner while fetching',
    file: 'product-card.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"loading-spinner" renamed to "product-loading-skeleton" in ProductCard TanStack migration',
  },
  {
    test: 'should NOT find product-error div (old selector)',
    file: 'product-card.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"product-error" renamed to "product-error-banner" in ProductCard TanStack migration',
  },
  {
    test: 'should show product-loading-skeleton (new skeleton UI)',
    file: 'product-card.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'product-loading-skeleton is the new loading element — test now possible',
  },
  {
    test: 'should show cart-success-toast after adding product',
    file: 'cart-optimistic.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'cart-success-toast is a new element for mutation feedback',
  },
  {
    test: 'should rollback cart on mutation error',
    file: 'cart-optimistic.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'Depends on TanStack Query optimistic rollback timing and cache state consistency',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #5 — Styled Components: design token rename + AlertBanner
// ═══════════════════════════════════════════════════════════
// Escenario: el design system cambia el naming de tokens de color.
// Los styled components que consumen el theme se rompen si usan
// los tokens viejos. AlertBanner es rediseñado con nuevos selectores.
// StyledButton gana shouldForwardProp para no filtrar transient props al DOM.
// ═══════════════════════════════════════════════════════════

export const PR_STYLED_COMPONENTS: PRMetadata = {
  prNumber: 105,
  title: 'feat: rename design tokens v2 + AlertBanner redesign',
  description:
    'Design token rename: primary→brand, danger→destructive, success→positive. ' +
    'StyledButton gains shouldForwardProp to prevent transient props leaking to DOM. ' +
    'AlertBanner redesigned: "alert-close"→"banner-close-btn", adds "banner-icon" and "banner-title".',
  author: 'emma',
  branch: 'feat/design-tokens-v2',
  commitSha: 'e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6',
  baseSha: '444444444444444444444444444444444444444',
  createdAt: '2024-04-10T11:00:00Z',
  mergedAt: null,
}

// Archivo 1: theme.ts — Design tokens (deps: ninguna)
export const THEME_TOKENS_CHUNK: ASTChunk = {
  filename: 'src/styles/theme.ts',
  rawDiff: [
    '-export const theme = {',
    '-  colors: {',
    '-    primary: "#3B82F6",',
    '-    primaryHover: "#2563EB",',
    '-    danger: "#EF4444",',
    '-    dangerHover: "#DC2626",',
    '-    success: "#10B981",',
    '-  },',
    '-}',
    '+export const theme = {',
    '+  colors: {',
    '+    brand: "#3B82F6",',
    '+    brandHover: "#2563EB",',
    '+    destructive: "#EF4444",',
    '+    destructiveHover: "#DC2626",',
    '+    positive: "#10B981",',
    '+    positiveHover: "#059669",',
    '+  },',
    '+  radius: { sm: "4px", md: "8px", lg: "12px" },',
    '+} as const',
    '+export type Theme = typeof theme',
  ].join('\n'),
  hunks: [hunk(
    ['brand: "#3B82F6"', 'destructive: "#EF4444"', 'positive: "#10B981"', 'export type Theme = typeof theme'],
    ['primary: "#3B82F6"', 'danger: "#EF4444"', 'success: "#10B981"']
  )],
  components: [],
  functions: [],
  jsxChanges: [],
  testIds: [],
  summary: 'Theme tokens renamed: primary→brand, danger→destructive, success→positive. Added radius tokens and Theme type export. "as const" for full TypeScript inference across styled-components.',
}

// Archivo 2: Button.styled.ts — Styled component con shouldForwardProp (deps: theme)
export const STYLED_BUTTON_CHUNK: ASTChunk = {
  filename: 'src/components/Button.styled.ts',
  rawDiff: [
    '-export const StyledButton = styled.button<{ $variant: "primary" | "danger" | "ghost" }>`',
    '-  background: ${({ $variant, theme }) =>',
    '-    $variant === "primary" ? theme.colors.primary :',
    '-    $variant === "danger" ? theme.colors.danger : "transparent"};',
    '-  &:hover { background: ${({ $variant, theme }) =>',
    '-    $variant === "primary" ? theme.colors.primaryHover : theme.colors.dangerHover}; }',
    '-`',
    '+export const StyledButton = styled.button',
    '+  .withConfig({',
    '+    shouldForwardProp: (p) => !["$variant", "$size", "$fullWidth"].includes(p),',
    '+  })',
    '+  <{ $variant: "brand" | "destructive" | "ghost"; $size?: "sm" | "md" | "lg"; $fullWidth?: boolean }>`',
    '+  background: ${({ $variant, theme }) =>',
    '+    $variant === "brand" ? theme.colors.brand :',
    '+    $variant === "destructive" ? theme.colors.destructive : "transparent"};',
    '+  border-radius: ${({ $size = "md", theme }) => theme.radius[$size]};',
    '+  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};',
    '+  &:hover { background: ${({ $variant, theme }) =>',
    '+    $variant === "brand" ? theme.colors.brandHover : theme.colors.destructiveHover}; }',
    '+`',
  ].join('\n'),
  hunks: [hunk(
    [
      'shouldForwardProp: (p) => !["$variant", "$size", "$fullWidth"].includes(p)',
      '"brand" | "destructive" | "ghost"',
      'theme.colors.brand',
      'theme.radius[$size]',
    ],
    [
      '"primary" | "danger" | "ghost"',
      'theme.colors.primary',
      'theme.colors.danger',
    ]
  )],
  components: ['StyledButton'],
  functions: ['withConfig', 'shouldForwardProp'],
  jsxChanges: [],
  testIds: [],
  summary: 'StyledButton: $variant "primary"→"brand", "danger"→"destructive". Adds shouldForwardProp to prevent transient props from reaching DOM. Adds $size using new theme.radius tokens and $fullWidth.',
}

// Archivo 3: AlertBanner.tsx — Componente con styled-components (deps: StyledButton + theme)
export const ALERT_BANNER_CHUNK: ASTChunk = {
  filename: 'src/components/AlertBanner.tsx',
  rawDiff: [
    '-export function AlertBanner({ message, onClose }: { message: string; onClose: () => void }) {',
    '-  return (',
    '-    <div data-test-id="alert-banner">',
    '-      <span>{message}</span>',
    '-      <button data-test-id="alert-close" onClick={onClose}>×</button>',
    '-    </div>',
    '-  )',
    '-}',
    '+type AlertVariant = "info" | "warning" | "error" | "success"',
    '+const ICONS: Record<AlertVariant, string> = { info: "ℹ", warning: "⚠", error: "✕", success: "✓" }',
    '+const BannerRoot = styled.div<{ $variant: AlertVariant }>`',
    '+  border-left: 4px solid ${({ $variant, theme }) => ({',
    '+    info: theme.colors.brand,',
    '+    warning: "#F59E0B",',
    '+    error: theme.colors.destructive,',
    '+    success: theme.colors.positive,',
    '+  }[$variant])};',
    '+`',
    '+export function AlertBanner({',
    '+  message, title, variant = "info", onClose',
    '+}: { message: string; title?: string; variant?: AlertVariant; onClose: () => void }) {',
    '+  return (',
    '+    <BannerRoot data-test-id="alert-banner" $variant={variant}>',
    '+      <span data-test-id="banner-icon" aria-hidden>{ICONS[variant]}</span>',
    '+      <div>',
    '+        {title && <strong data-test-id="banner-title">{title}</strong>}',
    '+        <span data-test-id="banner-message">{message}</span>',
    '+      </div>',
    '+      <StyledButton $variant="ghost" data-test-id="banner-close-btn" onClick={onClose} aria-label="Close">',
    '+        ×',
    '+      </StyledButton>',
    '+    </BannerRoot>',
    '+  )',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    [
      '<span data-test-id="banner-icon" aria-hidden>',
      '<strong data-test-id="banner-title">',
      '<StyledButton data-test-id="banner-close-btn">',
      '<span data-test-id="banner-message">',
    ],
    ['<button data-test-id="alert-close" onClick={onClose}>×</button>']
  )],
  components: ['AlertBanner', 'BannerRoot'],
  functions: ['styled'],
  jsxChanges: [
    { element: 'button', attribute: 'data-test-id', addedValue: 'banner-close-btn', removedValue: 'alert-close' },
    { element: 'span', attribute: 'data-test-id', addedValue: 'banner-icon' },
    { element: 'strong', attribute: 'data-test-id', addedValue: 'banner-title' },
    { element: 'span', attribute: 'data-test-id', addedValue: 'banner-message' },
  ],
  testIds: ['banner-close-btn', 'banner-icon', 'banner-title', 'banner-message', 'alert-close'],
  summary: 'AlertBanner redesigned with styled-components. "alert-close"→"banner-close-btn" (now StyledButton). Added banner-icon, banner-title, banner-message. Supports info/warning/error/success variants via theme tokens.',
}

export const STYLED_SPEC_FILES: SpecFile[] = [
  {
    name: 'alert-banner.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('AlertBanner — styled-components', () => {
  test('should close banner via alert-close (old selector)', async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('alert-close').click()
    await expect(page.getByTestId('alert-banner')).not.toBeVisible()
  })

  test('should close banner via banner-close-btn (new selector)', async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('banner-close-btn').click()
    await expect(page.getByTestId('alert-banner')).not.toBeVisible()
  })

  test('should show banner-icon with error variant', async ({ page }) => {
    await page.goto('/settings?variant=error')
    await expect(page.getByTestId('banner-icon')).toContainText('✕')
  })

  test('should display banner-title when provided', async ({ page }) => {
    await page.goto('/settings?showTitle=true')
    await expect(page.getByTestId('banner-title')).toBeVisible()
  })

  test('should apply destructive border color for error variant', async ({ page }) => {
    await page.goto('/settings?variant=error')
    const banner = page.getByTestId('alert-banner')
    const borderColor = await banner.evaluate((el) => getComputedStyle(el).borderLeftColor)
    expect(borderColor).toBe('rgb(239, 68, 68)')
  })
})
    `.trim(),
  },
  {
    name: 'styled-button.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('StyledButton — shouldForwardProp', () => {
  test('should not leak $variant prop to DOM', async ({ page }) => {
    await page.goto('/components/button')
    const button = page.locator('[data-test-id="banner-close-btn"]')
    const hasAttr = await button.evaluate((el) => el.hasAttribute('$variant'))
    expect(hasAttr).toBe(false)
  })

  test('should apply brand background for brand variant', async ({ page }) => {
    await page.goto('/components/button?variant=brand')
    const button = page.locator('button').first()
    const bg = await button.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(59, 130, 246)')
  })
})
    `.trim(),
  },
]

export const STYLED_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should close banner via alert-close (old selector)',
    file: 'alert-banner.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"alert-close" renamed to "banner-close-btn" in AlertBanner redesign with styled-components',
  },
  {
    test: 'should close banner via banner-close-btn (new selector)',
    file: 'alert-banner.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'banner-close-btn is the new correct selector after AlertBanner redesign',
  },
  {
    test: 'should show banner-icon with error variant',
    file: 'alert-banner.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'banner-icon is a new element added in AlertBanner redesign',
  },
  {
    test: 'should apply destructive border color for error variant',
    file: 'alert-banner.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'Depends on ThemeProvider providing renamed token "destructive" (was "danger") — misconfig breaks computed style',
  },
  {
    test: 'should not leak $variant prop to DOM',
    file: 'styled-button.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'shouldForwardProp now explicitly filters $variant from DOM propagation',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #6 — TailwindCSS + Radix UI (shadcn/ui Dialog pattern)
// ═══════════════════════════════════════════════════════════
// Escenario: el equipo reemplaza un Modal custom con Radix UI Dialog
// usando el patrón de shadcn/ui. Los data-test-id cambian a la
// nomenclatura de dialog-* y se agregan atributos data-[state] de Radix.
// ConfirmationModal se migra al nuevo Dialog compound component.
// ═══════════════════════════════════════════════════════════

export const PR_RADIX_DIALOG: PRMetadata = {
  prNumber: 106,
  title: 'feat: replace custom Modal with Radix UI Dialog (shadcn/ui pattern)',
  description:
    'Custom Modal replaced with Radix UI Dialog following shadcn/ui conventions. ' +
    'data-test-id: "modal-overlay"→"dialog-overlay", "modal-content"→"dialog-content", "modal-close"→"dialog-close-btn". ' +
    'Adds Tailwind data-[state=open]/data-[state=closed] animations. ' +
    'ConfirmationModal: "confirm-cancel-btn"→"confirmation-cancel-btn", "confirm-action-btn"→"confirmation-action-btn".',
  author: 'frank',
  branch: 'feat/radix-dialog-migration',
  commitSha: 'f6a7b8c9d0e1f6a7b8c9d0e1f6a7b8c9d0e1f6a7',
  baseSha: '555555555555555555555555555555555555555',
  createdAt: '2024-04-20T09:00:00Z',
  mergedAt: null,
}

// Archivo 1: Dialog.tsx — Radix UI wrapper shadcn-style (deps: ninguna)
export const RADIX_DIALOG_CHUNK: ASTChunk = {
  filename: 'src/components/ui/Dialog.tsx',
  rawDiff: [
    '-// custom modal — no Radix dependency',
    '-export function Modal({ open, onClose, children }: ModalProps) {',
    '-  if (!open) return null',
    '-  return (',
    '-    <>',
    '-      <div data-test-id="modal-overlay" className="fixed inset-0 bg-black/50" onClick={onClose} />',
    '-      <div data-test-id="modal-content" role="dialog">',
    '-        <button data-test-id="modal-close" onClick={onClose}>×</button>',
    '-        {children}',
    '-      </div>',
    '-    </>',
    '-  )',
    '-}',
    '+import * as DialogPrimitive from "@radix-ui/react-dialog"',
    '+',
    '+const DialogOverlay = React.forwardRef<',
    '+  React.ElementRef<typeof DialogPrimitive.Overlay>,',
    '+  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>',
    '+>((props, ref) => (',
    '+  <DialogPrimitive.Overlay',
    '+    ref={ref}',
    '+    data-test-id="dialog-overlay"',
    '+    className={cn(',
    '+      "fixed inset-0 bg-black/80",',
    '+      "data-[state=open]:animate-in data-[state=closed]:animate-out",',
    '+      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"',
    '+    )}',
    '+    {...props}',
    '+  />',
    '+))',
    '+',
    '+const DialogContent = React.forwardRef<',
    '+  React.ElementRef<typeof DialogPrimitive.Content>,',
    '+  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>',
    '+>((props, ref) => (',
    '+  <DialogPrimitive.Portal>',
    '+    <DialogOverlay />',
    '+    <DialogPrimitive.Content',
    '+      ref={ref}',
    '+      data-test-id="dialog-content"',
    '+      className={cn("fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]")}',
    '+      {...props}',
    '+    >',
    '+      {props.children}',
    '+      <DialogPrimitive.Close',
    '+        data-test-id="dialog-close-btn"',
    '+        className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"',
    '+      >',
    '+        <X className="h-4 w-4" /><span className="sr-only">Close</span>',
    '+      </DialogPrimitive.Close>',
    '+    </DialogPrimitive.Content>',
    '+  </DialogPrimitive.Portal>',
    '+))',
    '+',
    '+export const Dialog = DialogPrimitive.Root',
    '+export const DialogTrigger = DialogPrimitive.Trigger',
    '+export const DialogClose = DialogPrimitive.Close',
    '+export const DialogTitle = DialogPrimitive.Title',
    '+export const DialogDescription = DialogPrimitive.Description',
    '+export { DialogContent, DialogOverlay }',
  ].join('\n'),
  hunks: [hunk(
    [
      'data-test-id="dialog-overlay"',
      'data-test-id="dialog-content"',
      'data-test-id="dialog-close-btn"',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'DialogPrimitive.Portal',
    ],
    [
      'data-test-id="modal-overlay"',
      'data-test-id="modal-content"',
      'data-test-id="modal-close"',
    ]
  )],
  components: ['DialogOverlay', 'DialogContent'],
  functions: ['forwardRef', 'cn'],
  jsxChanges: [
    { element: 'div', attribute: 'data-test-id', addedValue: 'dialog-overlay', removedValue: 'modal-overlay' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'dialog-content', removedValue: 'modal-content' },
    { element: 'button', attribute: 'data-test-id', addedValue: 'dialog-close-btn', removedValue: 'modal-close' },
  ],
  testIds: ['dialog-overlay', 'dialog-content', 'dialog-close-btn', 'modal-overlay', 'modal-content', 'modal-close'],
  summary: 'Custom Modal replaced with Radix UI Dialog (shadcn). "modal-overlay"→"dialog-overlay", "modal-content"→"dialog-content", "modal-close"→"dialog-close-btn". Adds data-[state] Tailwind animations via Portal.',
}

// Archivo 2: ConfirmationModal.tsx — Usa nuevo Dialog (deps: Dialog)
export const CONFIRMATION_MODAL_CHUNK: ASTChunk = {
  filename: 'src/components/ConfirmationModal.tsx',
  rawDiff: [
    '-export function ConfirmationModal({ open, onConfirm, onCancel, message }: ConfirmationModalProps) {',
    '-  return (',
    '-    <Modal open={open} onClose={onCancel}>',
    '-      <h2>Confirm action</h2>',
    '-      <p>{message}</p>',
    '-      <button data-test-id="confirm-cancel-btn" onClick={onCancel}>Cancel</button>',
    '-      <button data-test-id="confirm-action-btn" onClick={onConfirm}>Confirm</button>',
    '-    </Modal>',
    '-  )',
    '-}',
    '+export function ConfirmationModal({',
    '+  open, onOpenChange, onConfirm, message, title, destructive = false',
    '+}: ConfirmationModalProps) {',
    '+  return (',
    '+    <Dialog open={open} onOpenChange={onOpenChange}>',
    '+      <DialogContent data-test-id="confirmation-dialog">',
    '+        <DialogTitle data-test-id="confirmation-title">{title ?? "Confirm action"}</DialogTitle>',
    '+        <DialogDescription data-test-id="confirmation-message">{message}</DialogDescription>',
    '+        <div className="flex justify-end gap-2 mt-4">',
    '+          <DialogClose asChild>',
    '+            <button data-test-id="confirmation-cancel-btn">Cancel</button>',
    '+          </DialogClose>',
    '+          <button',
    '+            data-test-id="confirmation-action-btn"',
    '+            data-destructive={destructive}',
    '+            className={cn("rounded px-4 py-2", destructive ? "bg-destructive text-white" : "bg-brand text-white")}',
    '+            onClick={onConfirm}',
    '+          >Confirm</button>',
    '+        </div>',
    '+      </DialogContent>',
    '+    </Dialog>',
    '+  )',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    [
      'data-test-id="confirmation-dialog"',
      'data-test-id="confirmation-title"',
      'data-test-id="confirmation-cancel-btn"',
      'data-test-id="confirmation-action-btn" data-destructive',
    ],
    [
      'data-test-id="confirm-cancel-btn"',
      'data-test-id="confirm-action-btn"',
    ]
  )],
  components: ['ConfirmationModal'],
  functions: ['cn'],
  jsxChanges: [
    { element: 'button', attribute: 'data-test-id', addedValue: 'confirmation-cancel-btn', removedValue: 'confirm-cancel-btn' },
    { element: 'button', attribute: 'data-test-id', addedValue: 'confirmation-action-btn', removedValue: 'confirm-action-btn' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'confirmation-dialog' },
    { element: 'h2', attribute: 'data-test-id', addedValue: 'confirmation-title' },
  ],
  testIds: ['confirmation-cancel-btn', 'confirmation-action-btn', 'confirmation-dialog', 'confirmation-title', 'confirm-cancel-btn', 'confirm-action-btn'],
  summary: 'ConfirmationModal migrated from custom Modal to Radix Dialog. "confirm-cancel-btn"→"confirmation-cancel-btn", "confirm-action-btn"→"confirmation-action-btn". Adds destructive prop with Tailwind conditional classes.',
}

export const RADIX_SPEC_FILES: SpecFile[] = [
  {
    name: 'dialog.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Dialog — Radix UI (shadcn)', () => {
  test('should close modal via modal-close (old selector)', async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('open-dialog-btn').click()
    await page.getByTestId('modal-close').click()
    await expect(page.getByTestId('modal-content')).not.toBeVisible()
  })

  test('should close dialog via dialog-close-btn (new selector)', async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('open-dialog-btn').click()
    await page.getByTestId('dialog-close-btn').click()
    await expect(page.getByTestId('dialog-content')).not.toBeVisible()
  })

  test('should show dialog-overlay when dialog is open', async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('open-dialog-btn').click()
    await expect(page.getByTestId('dialog-overlay')).toBeVisible()
  })

  test('should close dialog via Escape key', async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('open-dialog-btn').click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('dialog-content')).not.toBeVisible()
  })

  test('should have data-state=open on overlay when dialog is open', async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('open-dialog-btn').click()
    const overlay = page.getByTestId('dialog-overlay')
    await expect(overlay).toHaveAttribute('data-state', 'open')
  })
})
    `.trim(),
  },
  {
    name: 'confirmation-modal.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('ConfirmationModal — Radix Dialog', () => {
  test('should cancel via confirm-cancel-btn (old selector)', async ({ page }) => {
    await page.goto('/delete-item')
    await page.getByTestId('confirm-cancel-btn').click()
    await expect(page.getByTestId('confirmation-dialog')).not.toBeVisible()
  })

  test('should cancel via confirmation-cancel-btn (new selector)', async ({ page }) => {
    await page.goto('/delete-item')
    await page.getByTestId('confirmation-cancel-btn').click()
    await expect(page.getByTestId('confirmation-dialog')).not.toBeVisible()
  })

  test('should show confirmation-title', async ({ page }) => {
    await page.goto('/delete-item')
    await expect(page.getByTestId('confirmation-title')).toBeVisible()
  })

  test('should apply destructive style when data-destructive is set', async ({ page }) => {
    await page.goto('/delete-item?destructive=true')
    const btn = page.getByTestId('confirmation-action-btn')
    await expect(btn).toHaveAttribute('data-destructive', 'true')
  })
})
    `.trim(),
  },
]

export const RADIX_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should close modal via modal-close (old selector)',
    file: 'dialog.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"modal-close" renamed to "dialog-close-btn" in Radix Dialog migration',
  },
  {
    test: 'should cancel via confirm-cancel-btn (old selector)',
    file: 'confirmation-modal.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"confirm-cancel-btn" renamed to "confirmation-cancel-btn" in ConfirmationModal migration',
  },
  {
    test: 'should close dialog via dialog-close-btn (new selector)',
    file: 'dialog.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'dialog-close-btn is the new Radix DialogPrimitive.Close selector',
  },
  {
    test: 'should have data-state=open on overlay when dialog is open',
    file: 'dialog.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'Radix Dialog automatically sets data-state attribute — test now possible',
  },
  {
    test: 'should close dialog via Escape key',
    file: 'dialog.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'Radix Dialog handles keyboard events natively including Escape to close',
  },
  {
    test: 'should apply destructive style when data-destructive is set',
    file: 'confirmation-modal.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'Depends on Tailwind bg-destructive class being available — requires token in tailwind.config',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #7 — Monorepo: shared @company/ui package → multiple apps
// ═══════════════════════════════════════════════════════════
// Escenario: el paquete compartido packages/ui cambia la API del
// Button (prop "onClick"→"onPress" para cross-platform). Esto rompe
// apps/dashboard y apps/admin que consumen el componente.
// El grafo captura el impacto cross-package automáticamente.
// ═══════════════════════════════════════════════════════════

export const PR_MONOREPO: PRMetadata = {
  prNumber: 107,
  title: 'feat(packages/ui): Button onPress API + DataTable component',
  description:
    'Shared @company/ui Button: prop "onClick"→"onPress" for cross-platform (React Native) compatibility. ' +
    'Adds "loading" and "icon" props. ' +
    'New DataTable component added to packages/ui. ' +
    'Breaking: apps/dashboard CheckoutPage and apps/admin OrdersTable must update prop name.',
  author: 'grace',
  branch: 'feat/ui-pkg-onpress-api',
  commitSha: 'g7a8b9c0d1e2g7a8b9c0d1e2g7a8b9c0d1e2g7a8',
  baseSha: '666666666666666666666666666666666666666',
  createdAt: '2024-05-01T08:00:00Z',
  mergedAt: null,
}

// Archivo 1: packages/ui/src/Button.tsx — Shared component (deps: ninguna)
export const UI_PKG_BUTTON_CHUNK: ASTChunk = {
  filename: 'packages/ui/src/Button.tsx',
  rawDiff: [
    '-export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {',
    '-  variant?: "primary" | "secondary" | "ghost"',
    '-  onClick?: () => void',
    '-}',
    '+export interface ButtonProps {',
    '+  variant?: "primary" | "secondary" | "ghost" | "destructive"',
    '+  size?: "sm" | "md" | "lg"',
    '+  loading?: boolean',
    '+  icon?: React.ReactNode',
    '+  onPress?: () => void  // renamed from onClick for cross-platform compat',
    '+  disabled?: boolean',
    '+  children: React.ReactNode',
    '+  "data-test-id"?: string',
    '+}',
    '+',
    '-export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(',
    '-  ({ onClick, variant = "primary", ...props }, ref) => (',
    '-    <button ref={ref} onClick={onClick} data-variant={variant} {...props} />',
    '-  )',
    '-)',
    '+export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(',
    '+  ({ onPress, loading, icon, variant = "primary", size = "md", ...props }, ref) => (',
    '+    <button',
    '+      ref={ref}',
    '+      onClick={onPress}',
    '+      disabled={loading || props.disabled}',
    '+      data-variant={variant}',
    '+      data-size={size}',
    '+      data-loading={loading}',
    '+      aria-busy={loading}',
    '+    >',
    '+      {loading && <span data-test-id="btn-loading-spinner" aria-hidden>⟳</span>}',
    '+      {icon && <span data-test-id="btn-icon">{icon}</span>}',
    '+      {props.children}',
    '+    </button>',
    '+  )',
    '+)',
    '+',
    '+Button.displayName = "Button"',
  ].join('\n'),
  hunks: [hunk(
    [
      'onPress?: () => void  // renamed from onClick',
      'loading?: boolean',
      'data-loading={loading}',
      '<span data-test-id="btn-loading-spinner">',
    ],
    [
      'onClick?: () => void',
      '<button ref={ref} onClick={onClick}',
    ]
  )],
  components: ['Button'],
  functions: ['forwardRef'],
  jsxChanges: [
    { element: 'span', attribute: 'data-test-id', addedValue: 'btn-loading-spinner' },
    { element: 'span', attribute: 'data-test-id', addedValue: 'btn-icon' },
  ],
  testIds: ['btn-loading-spinner', 'btn-icon'],
  summary: 'Shared Button: prop "onClick"→"onPress" for cross-platform compatibility. Adds loading, icon, size props. Adds btn-loading-spinner and btn-icon elements. Breaking change for all consumers.',
}

// Archivo 2: apps/dashboard/src/CheckoutPage.tsx — Consume shared Button (deps: UI_PKG_BUTTON)
export const DASHBOARD_CHECKOUT_CHUNK: ASTChunk = {
  filename: 'apps/dashboard/src/CheckoutPage.tsx',
  rawDiff: [
    '-import { Button } from "@company/ui"',
    '-// ...',
    '-<Button data-test-id="checkout-submit-btn" onClick={handleSubmit}>',
    '-  Complete Purchase',
    '-</Button>',
    '-<Button data-test-id="checkout-cancel-btn" variant="ghost" onClick={handleCancel}>',
    '-  Cancel',
    '-</Button>',
    '+import { Button } from "@company/ui"',
    '+// ...',
    '+<Button',
    '+  data-test-id="checkout-submit-btn"',
    '+  onPress={handleSubmit}',
    '+  loading={isSubmitting}',
    '+>',
    '+  Complete Purchase',
    '+</Button>',
    '+<Button data-test-id="checkout-cancel-btn" variant="ghost" onPress={handleCancel}>',
    '+  Cancel',
    '+</Button>',
  ].join('\n'),
  hunks: [hunk(
    ['onPress={handleSubmit}', 'loading={isSubmitting}', 'onPress={handleCancel}'],
    ['onClick={handleSubmit}', 'onClick={handleCancel}']
  )],
  components: ['CheckoutPage'],
  functions: ['handleSubmit', 'handleCancel'],
  jsxChanges: [],
  testIds: ['checkout-submit-btn', 'checkout-cancel-btn'],
  summary: 'CheckoutPage updated to use Button onPress API (was onClick). Adds loading={isSubmitting} for submit button feedback. Part of monorepo @company/ui migration.',
}

// Archivo 3: apps/admin/src/OrdersTable.tsx — También consume shared Button (deps: UI_PKG_BUTTON)
export const ADMIN_ORDERS_CHUNK: ASTChunk = {
  filename: 'apps/admin/src/OrdersTable.tsx',
  rawDiff: [
    '-import { Button, DataTable } from "@company/ui"  // DataTable is new!',
    '-// ...',
    '-<Button data-test-id="approve-order-btn" onClick={() => approveOrder(row.id)}>',
    '-  Approve',
    '-</Button>',
    '-<Button data-test-id="reject-order-btn" variant="secondary" onClick={() => rejectOrder(row.id)}>',
    '-  Reject',
    '-</Button>',
    '+import { Button, DataTable } from "@company/ui"',
    '+// ...',
    '+<DataTable',
    '+  data-test-id="orders-table"',
    '+  columns={columns}',
    '+  data={orders}',
    '+  onRowClick={(row) => setSelectedOrder(row)}',
    '+/>',
    '+<Button',
    '+  data-test-id="approve-order-btn"',
    '+  onPress={() => approveOrder(selectedOrder?.id)}',
    '+  icon={<CheckIcon />}',
    '+>',
    '+  Approve',
    '+</Button>',
    '+<Button',
    '+  data-test-id="reject-order-btn"',
    '+  variant="destructive"',
    '+  onPress={() => rejectOrder(selectedOrder?.id)}',
    '+>',
    '+  Reject',
    '+</Button>',
  ].join('\n'),
  hunks: [hunk(
    [
      '<DataTable data-test-id="orders-table"',
      'onPress={() => approveOrder(selectedOrder?.id)}',
      'icon={<CheckIcon />}',
      'variant="destructive"',
    ],
    [
      'onClick={() => approveOrder(row.id)',
      'onClick={() => rejectOrder(row.id)',
    ]
  )],
  components: ['OrdersTable'],
  functions: ['approveOrder', 'rejectOrder'],
  jsxChanges: [
    { element: 'div', attribute: 'data-test-id', addedValue: 'orders-table' },
  ],
  testIds: ['orders-table', 'approve-order-btn', 'reject-order-btn'],
  summary: 'OrdersTable migrated to Button onPress API. Adds DataTable component (new from @company/ui). reject button now uses destructive variant. Adds icon to approve button.',
}

export const MONOREPO_SPEC_FILES: SpecFile[] = [
  {
    name: 'apps/dashboard/checkout.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Dashboard — CheckoutPage (monorepo shared Button)', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('should submit checkout via checkout-submit-btn', async ({ page }) => {
    await page.goto('/dashboard/checkout')
    await page.getByTestId('checkout-submit-btn').click()
    await expect(page.getByTestId('checkout-success')).toBeVisible()
  })

  test('should show btn-loading-spinner while submitting', async ({ page }) => {
    await page.route('**/api/checkout', async (route) => {
      await new Promise((r) => setTimeout(r, 500))
      await route.continue()
    })
    await page.goto('/dashboard/checkout')
    await page.getByTestId('checkout-submit-btn').click()
    await expect(page.getByTestId('btn-loading-spinner')).toBeVisible()
  })

  test('should cancel checkout via checkout-cancel-btn', async ({ page }) => {
    await page.goto('/dashboard/checkout')
    await page.getByTestId('checkout-cancel-btn').click()
    await expect(page).toHaveURL('/dashboard')
  })
})
    `.trim(),
  },
  {
    name: 'apps/admin/orders.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Admin — OrdersTable (monorepo shared Button + DataTable)', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' })

  test('should display orders-table', async ({ page }) => {
    await page.goto('/admin/orders')
    await expect(page.getByTestId('orders-table')).toBeVisible()
  })

  test('should approve order via approve-order-btn', async ({ page }) => {
    await page.goto('/admin/orders')
    await page.getByTestId('approve-order-btn').click()
    await expect(page.getByTestId('order-status')).toHaveText('Approved')
  })

  test('should reject order via reject-order-btn', async ({ page }) => {
    await page.goto('/admin/orders')
    await page.getByTestId('reject-order-btn').click()
    await expect(page.getByTestId('order-status')).toHaveText('Rejected')
  })

  test('should show btn-icon on approve button', async ({ page }) => {
    await page.goto('/admin/orders')
    await expect(page.getByTestId('btn-icon')).toBeVisible()
  })
})
    `.trim(),
  },
]

export const MONOREPO_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should show btn-loading-spinner while submitting',
    file: 'apps/dashboard/checkout.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'btn-loading-spinner is a new element added to shared Button with loading prop',
  },
  {
    test: 'should display orders-table',
    file: 'apps/admin/orders.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'orders-table is a new DataTable element from @company/ui package',
  },
  {
    test: 'should approve order via approve-order-btn',
    file: 'apps/admin/orders.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'approveOrder now receives selectedOrder?.id (may be undefined) instead of row.id — logic change',
  },
  {
    test: 'should reject order via reject-order-btn',
    file: 'apps/admin/orders.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'rejectOrder now receives selectedOrder?.id — requires row selection before action',
  },
  {
    test: 'should show btn-icon on approve button',
    file: 'apps/admin/orders.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'btn-icon is a new element added to shared Button when icon prop is provided',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #8 — Next.js App Router: RSC → Server+Client split + API Route
// ═══════════════════════════════════════════════════════════
// Escenario: una página monolítica RSC se divide en tres partes:
// RSC padre con generateStaticParams/generateMetadata, Client Component
// interactivo ("use client") con Server Action, y API Route handler
// GET+POST. Los tests que mockeaban la URL antigua fallan porque la
// carga pasa a Suspense boundary. "add-to-cart" → "product-add-to-cart-btn".
// ═══════════════════════════════════════════════════════════

export const PR_RSC_SPLIT: PRMetadata = {
  prNumber: 108,
  title: 'feat(app-router): split ProductPage RSC into Server+Client + API Route handler',
  description:
    'ProductPage refactored from monolithic RSC to proper Server/Client split. ' +
    'Server layer: generateStaticParams for SSG, generateMetadata for SEO, Suspense streaming. ' +
    'Client layer: "use client" ProductInteractions handles cart via Server Action. ' +
    'New API Route: /api/products/[slug]/route.ts with GET (force-cache) and POST (add-to-cart). ' +
    'Breaking: "product-detail-loading" removed from RSC (now Suspense fallback). ' +
    '"add-to-cart" renamed to "product-add-to-cart-btn". Adds "product-cart-feedback" and "product-cart-error".',
  author: 'hana',
  branch: 'feat/app-router-rsc-client-split',
  commitSha: 'h8i9j0k1l2m3h8i9j0k1l2m3h8i9j0k1l2m3h8i9',
  baseSha: '777777777777777777777777777777777777777',
  createdAt: '2024-05-10T09:00:00Z',
  mergedAt: null,
}

// Archivo 1: apps/web/app/products/[slug]/page.tsx — RSC con generateStaticParams
export const RSC_PRODUCT_PAGE_CHUNK: ASTChunk = {
  filename: 'apps/web/app/products/[slug]/page.tsx',
  rawDiff: [
    '-// Single monolithic Server Component — no streaming',
    '-export default async function ProductPage({ params }: { params: { slug: string } }) {',
    '-  const product = await fetch(`/api/products/${params.slug}`).then(r => r.json())',
    '-  if (!product) return <div data-test-id="product-not-found">Product not found</div>',
    '-  return (',
    '-    <main data-test-id="product-detail">',
    '-      <div data-test-id="product-detail-loading">Loading...</div>',
    '-      <h1 data-test-id="product-title">{product.name}</h1>',
    '-      <p data-test-id="product-price">${product.price}</p>',
    '-      <button data-test-id="add-to-cart" onClick={() => addToCart(product.id)}>Add to cart</button>',
    '-    </main>',
    '-  )',
    '-}',
    '+import { Suspense } from "react"',
    '+import { notFound } from "next/navigation"',
    '+import type { Metadata } from "next"',
    '+import { ProductInteractions } from "./ProductInteractions"',
    '+import { ProductSkeleton } from "@company/ui"',
    '+',
    '+export async function generateStaticParams() {',
    '+  const products = await fetch(`${process.env.API_BASE_URL}/products`, {',
    '+    next: { revalidate: 3600 },',
    '+  }).then(r => r.json() as Promise<Array<{ slug: string }>>)',
    '+  return products.map(p => ({ slug: p.slug }))',
    '+}',
    '+',
    '+export async function generateMetadata(',
    '+  { params }: { params: { slug: string } }',
    '+): Promise<Metadata> {',
    '+  const product = await fetch(`${process.env.API_BASE_URL}/products/${params.slug}`, {',
    '+    next: { tags: [`product-${params.slug}`] },',
    '+  }).then(r => r.json() as Promise<{ name: string; description: string }>)',
    '+  return { title: product.name, description: product.description }',
    '+}',
    '+',
    '+export default async function ProductPage({ params }: { params: { slug: string } }) {',
    '+  const product = await fetch(`${process.env.API_BASE_URL}/products/${params.slug}`, {',
    '+    next: { tags: [`product-${params.slug}`] },',
    '+  }).then(r => r.json() as Promise<{ id: string; name: string; price: number } | null>)',
    '+  if (!product) notFound()',
    '+  return (',
    '+    <main data-test-id="product-detail">',
    '+      <h1 data-test-id="product-title">{product!.name}</h1>',
    '+      <p data-test-id="product-price">${product!.price}</p>',
    '+      <Suspense fallback={<ProductSkeleton data-test-id="product-interactions-skeleton" />}>',
    '+        <ProductInteractions productId={product!.id} />',
    '+      </Suspense>',
    '+    </main>',
    '+  )',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    [
      'export async function generateStaticParams()',
      'export async function generateMetadata({ params }): Promise<Metadata>',
      '<Suspense fallback={<ProductSkeleton data-test-id="product-interactions-skeleton" />}>',
      'if (!product) notFound()',
    ],
    [
      '<div data-test-id="product-detail-loading">Loading...</div>',
      '<button data-test-id="add-to-cart" onClick={() => addToCart(product.id)}>Add to cart</button>',
    ]
  )],
  components: ['ProductPage', 'ProductInteractions', 'ProductSkeleton'],
  functions: ['generateStaticParams', 'generateMetadata', 'notFound'],
  jsxChanges: [
    { element: 'div', attribute: 'data-test-id', removedValue: 'product-detail-loading' },
    { element: 'button', attribute: 'data-test-id', removedValue: 'add-to-cart' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'product-interactions-skeleton' },
  ],
  testIds: ['product-detail', 'product-title', 'product-price', 'product-detail-loading', 'add-to-cart', 'product-interactions-skeleton'],
  summary: 'ProductPage RSC adds generateStaticParams (SSG) and generateMetadata (SEO). Suspense boundary wraps ProductInteractions. "product-detail-loading" and "add-to-cart" removed from RSC — owned by the new client component.',
}

// Archivo 2: apps/web/app/products/[slug]/ProductInteractions.tsx — "use client"
export const RSC_PRODUCT_INTERACTIONS_CHUNK: ASTChunk = {
  filename: 'apps/web/app/products/[slug]/ProductInteractions.tsx',
  rawDiff: [
    '+"use client"',
    '+import { useState, useTransition } from "react"',
    '+import { addToCartAction } from "@/app/actions/cart"',
    '+',
    '+export function ProductInteractions({ productId }: { productId: string }) {',
    '+  const [isPending, startTransition] = useTransition()',
    '+  const [feedback, setFeedback] = useState<"idle" | "added" | "error">("idle")',
    '+',
    '+  function handleAddToCart() {',
    '+    startTransition(async () => {',
    '+      const result = await addToCartAction(productId)',
    '+      setFeedback(result.ok ? "added" : "error")',
    '+    })',
    '+  }',
    '+',
    '+  return (',
    '+    <div data-test-id="product-interactions">',
    '+      <button data-test-id="product-add-to-cart-btn" disabled={isPending} onClick={handleAddToCart}>',
    '+        {isPending ? "Adding..." : "Add to cart"}',
    '+      </button>',
    '+      {feedback === "added" && (',
    '+        <div data-test-id="product-cart-feedback" role="status">Added to cart!</div>',
    '+      )}',
    '+      {feedback === "error" && (',
    '+        <div data-test-id="product-cart-error" role="alert">Failed to add. Try again.</div>',
    '+      )}',
    '+    </div>',
    '+  )',
    '+}',
  ].join('\n'),
  hunks: [hunk([
    '"use client"',
    'export function ProductInteractions({ productId })',
    '<button data-test-id="product-add-to-cart-btn" disabled={isPending}>',
    '<div data-test-id="product-cart-feedback" role="status">',
    '<div data-test-id="product-cart-error" role="alert">',
  ])],
  components: ['ProductInteractions'],
  functions: ['handleAddToCart', 'useState', 'useTransition', 'addToCartAction'],
  jsxChanges: [
    { element: 'button', attribute: 'data-test-id', addedValue: 'product-add-to-cart-btn' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'product-cart-feedback' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'product-cart-error' },
  ],
  testIds: ['product-interactions', 'product-add-to-cart-btn', 'product-cart-feedback', 'product-cart-error'],
  summary: 'New "use client" ProductInteractions. Handles cart via Server Action addToCartAction with useTransition. Replaces RSC "add-to-cart" with "product-add-to-cart-btn". Adds "product-cart-feedback" and "product-cart-error" feedback elements.',
}

// Archivo 3: apps/web/app/api/products/[slug]/route.ts — API Route Handler (no JSX)
export const RSC_API_ROUTE_CHUNK: ASTChunk = {
  filename: 'apps/web/app/api/products/[slug]/route.ts',
  rawDiff: [
    '+// NEW FILE — App Router API Route Handler',
    '+import { NextRequest, NextResponse } from "next/server"',
    '+import { cookies } from "next/headers"',
    '+',
    '+export const dynamic = "force-dynamic"',
    '+',
    '+export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {',
    '+  const res = await fetch(`${process.env.API_BASE_URL}/products/${params.slug}`, {',
    '+    cache: "force-cache", next: { tags: [`product-${params.slug}`] },',
    '+  })',
    '+  if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 })',
    '+  return NextResponse.json(await res.json())',
    '+}',
    '+',
    '+export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {',
    '+  const cookieStore = cookies()',
    '+  const sessionToken = cookieStore.get("session")?.value',
    '+  if (!sessionToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })',
    '+  const body = await req.json() as { quantity: number }',
    '+  const res = await fetch(`${process.env.API_BASE_URL}/cart`, {',
    '+    method: "POST",',
    '+    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` },',
    '+    body: JSON.stringify({ slug: params.slug, quantity: body.quantity }),',
    '+  })',
    '+  if (!res.ok) return NextResponse.json({ error: "Failed to add" }, { status: res.status })',
    '+  return NextResponse.json({ ok: true })',
    '+}',
  ].join('\n'),
  hunks: [hunk([
    'export async function GET(_req: NextRequest, { params })',
    'cache: "force-cache", next: { tags: [`product-${params.slug}`] }',
    'export async function POST(req: NextRequest, { params })',
    'const cookieStore = cookies()',
    'if (!sessionToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })',
  ])],
  components: [],
  functions: ['GET', 'POST', 'cookies', 'NextResponse.json'],
  jsxChanges: [],
  testIds: [],
  summary: 'New App Router API Route for /api/products/[slug]. GET uses force-cache with Next.js ISR tags. POST validates session cookie and proxies to upstream cart API with Bearer auth. No JSX — pure server handler.',
}

export const RSC_SPEC_FILES: SpecFile[] = [
  {
    name: 'apps/web/product-detail.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('ProductPage — App Router RSC split', () => {
  test('should show product-detail-loading (OLD — removed from RSC)', async ({ page }) => {
    await page.goto('/products/cool-widget')
    await expect(page.getByTestId('product-detail-loading')).toBeVisible()
  })

  test('should show product-interactions-skeleton while client hydrates', async ({ page }) => {
    await page.route('**/api/products/cool-widget', (route) =>
      route.fulfill({ json: { id: '1', name: 'Cool Widget', price: 49.99 } })
    )
    await page.goto('/products/cool-widget')
    await expect(page.getByTestId('product-interactions-skeleton')).toBeVisible()
  })

  test('should fail with old add-to-cart selector', async ({ page }) => {
    await page.goto('/products/cool-widget')
    await page.getByTestId('add-to-cart').click()
  })

  test('should add to cart via product-add-to-cart-btn', async ({ page }) => {
    await page.route('**/api/products/cool-widget', (route) =>
      route.fulfill({ json: { id: '1', name: 'Cool Widget', price: 49.99 } })
    )
    await page.goto('/products/cool-widget')
    await page.getByTestId('product-add-to-cart-btn').click()
    await expect(page.getByTestId('product-cart-feedback')).toBeVisible()
  })

  test('should show product-cart-error when server action fails', async ({ page }) => {
    await page.route('**/api/cart', (route) => route.abort())
    await page.goto('/products/cool-widget')
    await page.getByTestId('product-add-to-cart-btn').click()
    await expect(page.getByTestId('product-cart-error')).toBeVisible()
  })

  test('should return 401 when POST cart without session cookie', async ({ request }) => {
    const res = await request.post('/api/products/cool-widget', { data: { quantity: 1 } })
    expect(res.status()).toBe(401)
  })
})
    `.trim(),
  },
]

export const RSC_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should show product-detail-loading (OLD — removed from RSC)',
    file: 'apps/web/product-detail.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"product-detail-loading" removed from RSC ProductPage — loading state now inside Suspense boundary in ProductInteractions client component',
  },
  {
    test: 'should fail with old add-to-cart selector',
    file: 'apps/web/product-detail.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"add-to-cart" testId removed from RSC, replaced with "product-add-to-cart-btn" in ProductInteractions client component',
  },
  {
    test: 'should show product-interactions-skeleton while client hydrates',
    file: 'apps/web/product-detail.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'product-interactions-skeleton is the new Suspense fallback — renders server-side before client hydration',
  },
  {
    test: 'should add to cart via product-add-to-cart-btn',
    file: 'apps/web/product-detail.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'product-add-to-cart-btn is the new selector inside ProductInteractions client component',
  },
  {
    test: 'should show product-cart-error when server action fails',
    file: 'apps/web/product-detail.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'Server Action addToCartAction goes through Next.js internal transport — page.route() may not intercept it; requires mocking the upstream fetch',
  },
  {
    test: 'should return 401 when POST cart without session cookie',
    file: 'apps/web/product-detail.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'New POST handler validates cookies() — correctly returns 401 when session cookie absent',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #9 — packages/api-client: v1→v2 endpoint migration + interceptors
// ═══════════════════════════════════════════════════════════
// Escenario: packages/api-client centraliza el networking del monorepo.
// EndpointRegistry migra productos y órdenes de /v1 a /v2.
// ApiClient gana interceptors de request/response. apps/web y apps/dashboard
// consumen este paquete — cross-package blast radius: los mocks E2E que
// usaban "**/v1/products**" ahora no interceptan nada.
// ═══════════════════════════════════════════════════════════

export const PR_API_CLIENT: PRMetadata = {
  prNumber: 109,
  title: 'feat(packages/api-client): v2 endpoint migration + request/response interceptors',
  description:
    'EndpointRegistry migrates products and orders from /v1 to /v2. Cart stays at /v1. ' +
    'ApiClient gains composable interceptor pipeline: useRequestInterceptor (Bearer token + X-Correlation-ID) ' +
    'and useResponseInterceptor (5xx logging). Adds PUT and DELETE methods. ' +
    'Breaking: all E2E route mocks using "**/v1/products**" or "**/v1/orders**" will miss requests. ' +
    'Cross-package blast radius: apps/web and apps/dashboard both affected.',
  author: 'ivan',
  branch: 'feat/api-client-v2-interceptors',
  commitSha: 'i9j0k1l2m3n4i9j0k1l2m3n4i9j0k1l2m3n4i9j0',
  baseSha: '888888888888888888888888888888888888888',
  createdAt: '2024-05-20T10:00:00Z',
  mergedAt: null,
}

// Archivo 1: packages/api-client/src/EndpointRegistry.ts — v1→v2
export const ENDPOINT_REGISTRY_CHUNK: ASTChunk = {
  filename: 'packages/api-client/src/EndpointRegistry.ts',
  rawDiff: [
    '-export const endpoints = {',
    '-  products: {',
    '-    list:   "/v1/products",',
    '-    detail: (id: string) => `/v1/products/${id}`,',
    '-    search: "/v1/products/search",',
    '-  },',
    '-  cart:     { get: "/v1/cart", add: "/v1/cart/items", remove: (id: string) => `/v1/cart/items/${id}` },',
    '-  orders:   { list: "/v1/orders", detail: (id: string) => `/v1/orders/${id}` },',
    '-}',
    '+export const API_VERSION = { products: "v2", cart: "v1", orders: "v2" } as const',
    '+',
    '+export const endpoints = {',
    '+  products: {',
    '+    list:       "/v2/products",',
    '+    detail:     (id: string) => `/v2/products/${id}`,',
    '+    search:     "/v2/products/search",',
    '+    byCategory: (cat: string) => `/v2/products?category=${cat}`,',
    '+  },',
    '+  cart:    { get: "/v1/cart", add: "/v1/cart/items", remove: (id: string) => `/v1/cart/items/${id}` },',
    '+  orders:  { list: "/v2/orders", detail: (id: string) => `/v2/orders/${id}` },',
    '+} as const',
  ].join('\n'),
  hunks: [hunk(
    [
      'export const API_VERSION = { products: "v2", cart: "v1", orders: "v2" } as const',
      'products.list: "/v2/products"',
      'products.detail: (id) => `/v2/products/${id}`',
      'products.byCategory: (cat) => `/v2/products?category=${cat}`',
      'orders: { list: "/v2/orders", detail: (id) => `/v2/orders/${id}` }',
    ],
    [
      'products.list: "/v1/products"',
      'products.detail: (id) => `/v1/products/${id}`',
      'orders: { list: "/v1/orders", detail: (id) => `/v1/orders/${id}` }',
    ]
  )],
  components: [],
  functions: ['endpoints'],
  jsxChanges: [],
  testIds: [],
  summary: 'EndpointRegistry migrates products and orders from /v1 to /v2. Cart endpoints remain at /v1. Adds products.byCategory and API_VERSION const. Breaking for all consumers — cross-package blast radius.',
}

// Archivo 2: packages/api-client/src/ApiClient.ts — interceptors
export const API_CLIENT_INTERCEPTORS_CHUNK: ASTChunk = {
  filename: 'packages/api-client/src/ApiClient.ts',
  rawDiff: [
    '-export class ApiClient {',
    '-  constructor(private baseUrl: string) {}',
    '-  async get<T>(path: string): Promise<T> {',
    '-    const res = await fetch(`${this.baseUrl}${path}`)',
    '-    if (!res.ok) throw new Error(`HTTP ${res.status}`)',
    '-    return res.json() as Promise<T>',
    '-  }',
    '-  async post<T>(path: string, body: unknown): Promise<T> {',
    '-    const res = await fetch(`${this.baseUrl}${path}`, { method: "POST", body: JSON.stringify(body) })',
    '-    if (!res.ok) throw new Error(`HTTP ${res.status}`)',
    '-    return res.json() as Promise<T>',
    '-  }',
    '-}',
    '+type RequestInterceptor = (req: RequestInit & { url: string }) => RequestInit & { url: string }',
    '+type ResponseInterceptor = (res: Response) => Promise<Response>',
    '+',
    '+export class ApiClient {',
    '+  private requestInterceptors: RequestInterceptor[] = []',
    '+  private responseInterceptors: ResponseInterceptor[] = []',
    '+',
    '+  constructor(private baseUrl: string, private authTokenFn?: () => string | null) {}',
    '+',
    '+  useRequestInterceptor(fn: RequestInterceptor): this { this.requestInterceptors.push(fn); return this }',
    '+  useResponseInterceptor(fn: ResponseInterceptor): this { this.responseInterceptors.push(fn); return this }',
    '+',
    '+  private applyRequestInterceptors(init: RequestInit & { url: string }) {',
    '+    return this.requestInterceptors.reduce((acc, fn) => fn(acc), init)',
    '+  }',
    '+  private async applyResponseInterceptors(res: Response) {',
    '+    let cur = res',
    '+    for (const fn of this.responseInterceptors) cur = await fn(cur)',
    '+    return cur',
    '+  }',
    '+',
    '+  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {',
    '+    const token = this.authTokenFn?.() ?? null',
    '+    const config = this.applyRequestInterceptors({',
    '+      ...init, url: `${this.baseUrl}${path}`,',
    '+      headers: {',
    '+        "Content-Type": "application/json",',
    '+        ...(token ? { Authorization: `Bearer ${token}` } : {}),',
    '+        "X-Correlation-ID": crypto.randomUUID(),',
    '+        ...(init.headers ?? {}),',
    '+      },',
    '+    })',
    '+    const res = await this.applyResponseInterceptors(await fetch(config.url, config))',
    '+    if (!res.ok) { const err = await res.json().catch(() => ({})) as { message?: string }; throw new Error(err.message ?? `HTTP ${res.status}`) }',
    '+    return res.json() as Promise<T>',
    '+  }',
    '+',
    '+  get<T>(path: string) { return this.request<T>(path) }',
    '+  post<T>(path: string, body: unknown) { return this.request<T>(path, { method: "POST", body: JSON.stringify(body) }) }',
    '+  put<T>(path: string, body: unknown) { return this.request<T>(path, { method: "PUT", body: JSON.stringify(body) }) }',
    '+  delete<T>(path: string) { return this.request<T>(path, { method: "DELETE" }) }',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    [
      'useRequestInterceptor(fn: RequestInterceptor): this',
      'useResponseInterceptor(fn: ResponseInterceptor): this',
      'private applyRequestInterceptors(init)',
      '"X-Correlation-ID": crypto.randomUUID()',
      'put<T>(path, body) { return this.request<T>(path, { method: "PUT" }) }',
      'delete<T>(path) { return this.request<T>(path, { method: "DELETE" }) }',
    ],
    [
      'async get<T>(path: string): Promise<T>',
      'async post<T>(path: string, body: unknown): Promise<T>',
    ]
  )],
  components: [],
  functions: ['useRequestInterceptor', 'useResponseInterceptor', 'applyRequestInterceptors', 'applyResponseInterceptors', 'request', 'get', 'post', 'put', 'delete'],
  jsxChanges: [],
  testIds: [],
  summary: 'ApiClient gains composable interceptor pipeline: request interceptor injects Bearer token + X-Correlation-ID, response interceptor normalizes errors. Adds PUT and DELETE methods. authTokenFn injected via constructor.',
}

// Archivo 3: apps/web/src/lib/apiClientInstance.ts — consumidor de packages/api-client
export const WEB_API_CLIENT_INSTANCE_CHUNK: ASTChunk = {
  filename: 'apps/web/src/lib/apiClientInstance.ts',
  rawDiff: [
    '-import { ApiClient } from "@company/api-client"',
    '-export const webApiClient = new ApiClient(process.env.NEXT_PUBLIC_API_BASE_URL ?? "")',
    '+import { ApiClient } from "@company/api-client"',
    '+import { endpoints } from "@company/api-client/EndpointRegistry"',
    '+',
    '+function getSessionToken(): string | null {',
    '+  if (typeof document === "undefined") return null',
    '+  return document.cookie.split("; ").find(r => r.startsWith("session="))?.split("=")[1] ?? null',
    '+}',
    '+',
    '+export const webApiClient = new ApiClient(process.env.NEXT_PUBLIC_API_BASE_URL ?? "", getSessionToken)',
    '+  .useRequestInterceptor((req) => { console.debug("[api] →", req.url); return req })',
    '+  .useResponseInterceptor(async (res) => { if (res.status >= 500) console.error("[api] 5xx:", res.status); return res })',
    '+',
    '+export { endpoints }',
  ].join('\n'),
  hunks: [hunk(
    [
      'import { endpoints } from "@company/api-client/EndpointRegistry"',
      'function getSessionToken(): string | null',
      '.useRequestInterceptor((req) => { console.debug("[api] →", req.url) })',
      '.useResponseInterceptor(async (res) => { if (res.status >= 500) console.error(...) })',
      'export { endpoints }',
    ],
    ['export const webApiClient = new ApiClient(process.env.NEXT_PUBLIC_API_BASE_URL ?? "")']
  )],
  components: [],
  functions: ['getSessionToken', 'useRequestInterceptor', 'useResponseInterceptor'],
  jsxChanges: [],
  testIds: [],
  summary: 'apps/web ApiClient instance gains auth token injection via cookie reader and two interceptors: request logger and 5xx error logger. Exports endpoints registry for consumers. Session token read from document.cookie.',
}

export const API_CLIENT_SPEC_FILES: SpecFile[] = [
  {
    name: 'apps/web/product-list.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Product list — api-client v2 migration', () => {
  test('should load products via v1 route mock (OLD — will miss)', async ({ page }) => {
    await page.route('**/v1/products', (route) =>
      route.fulfill({ json: [{ id: '1', name: 'Widget A', slug: 'widget-a' }] })
    )
    await page.goto('/products')
    await expect(page.getByTestId('product-list')).toBeVisible()
  })

  test('should load products via v2 route mock (NEW)', async ({ page }) => {
    await page.route('**/v2/products', (route) =>
      route.fulfill({ json: [{ id: '1', name: 'Widget A', slug: 'widget-a' }] })
    )
    await page.goto('/products')
    await expect(page.getByTestId('product-list')).toBeVisible()
  })

  test('should send X-Correlation-ID header with every request', async ({ page }) => {
    const headers: Record<string, string> = {}
    await page.route('**/v2/products', (route) => {
      Object.assign(headers, route.request().headers())
      route.fulfill({ json: [] })
    })
    await page.goto('/products')
    await expect.poll(() => headers['x-correlation-id']).toBeTruthy()
  })

  test('should send Authorization header when session cookie present', async ({ page }) => {
    await page.context().addCookies([{ name: 'session', value: 'test-token', url: 'http://localhost:3000' }])
    const headers: Record<string, string> = {}
    await page.route('**/v2/products', (route) => {
      Object.assign(headers, route.request().headers())
      route.fulfill({ json: [] })
    })
    await page.goto('/products')
    await expect.poll(() => headers['authorization']).toContain('Bearer test-token')
  })
})
    `.trim(),
  },
  {
    name: 'apps/dashboard/orders-list.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Dashboard orders — api-client v2 blast radius', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('should load orders via v1 route mock (OLD — will miss after migration)', async ({ page }) => {
    await page.route('**/v1/orders', (route) =>
      route.fulfill({ json: [{ id: 'o1', status: 'pending' }] })
    )
    await page.goto('/dashboard/orders')
    await expect(page.getByTestId('orders-list')).toBeVisible()
  })

  test('should load orders via v2 route mock (NEW)', async ({ page }) => {
    await page.route('**/v2/orders', (route) =>
      route.fulfill({ json: [{ id: 'o1', status: 'pending' }] })
    )
    await page.goto('/dashboard/orders')
    await expect(page.getByTestId('orders-list')).toBeVisible()
  })
})
    `.trim(),
  },
]

export const API_CLIENT_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should load products via v1 route mock (OLD — will miss)',
    file: 'apps/web/product-list.spec.ts',
    line: 0,
    status: 'broken',
    reason: 'EndpointRegistry changed products.list from "/v1/products" to "/v2/products" — page.route("**/v1/products") never matches; real request hits /v2/products',
  },
  {
    test: 'should load orders via v1 route mock (OLD — will miss after migration)',
    file: 'apps/dashboard/orders-list.spec.ts',
    line: 0,
    status: 'broken',
    reason: 'Cross-package blast radius: EndpointRegistry changed orders from /v1 to /v2 — apps/dashboard affected with no code changes in that app',
  },
  {
    test: 'should load products via v2 route mock (NEW)',
    file: 'apps/web/product-list.spec.ts',
    line: 0,
    status: 'ok',
    reason: '"**/v2/products" is the correct new route pattern after EndpointRegistry migration',
  },
  {
    test: 'should send X-Correlation-ID header with every request',
    file: 'apps/web/product-list.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'ApiClient now injects X-Correlation-ID via request interceptor on every call',
  },
  {
    test: 'should send Authorization header when session cookie present',
    file: 'apps/web/product-list.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'getSessionToken reads document.cookie — addCookies must be called before page navigation; timing-dependent',
  },
  {
    test: 'should load orders via v2 route mock (NEW)',
    file: 'apps/dashboard/orders-list.spec.ts',
    line: 0,
    status: 'ok',
    reason: '"**/v2/orders" correctly matches the new EndpointRegistry orders.list path',
  },
]

// ═══════════════════════════════════════════════════════════
// PR #10 — Next.js middleware expanded + Server Actions + packages/auth
// ═══════════════════════════════════════════════════════════
// Escenario: packages/auth centraliza la validación de sesión.
// El middleware Next.js expande su matcher para proteger nuevas rutas
// (/dashboard/settings, /checkout/:path*, /api/admin/:path*).
// Login/logout se migran a Server Actions ("use server"). Los tests que
// navegaban a /dashboard/settings sin auth antes pasaban (no estaba
// protegido) y ahora reciben redirect — breakage sin cambio de UI selector.
// ═══════════════════════════════════════════════════════════

export const PR_AUTH_MIDDLEWARE: PRMetadata = {
  prNumber: 110,
  title: 'feat(auth): packages/auth + expand middleware matcher + Server Actions login/logout',
  description:
    'New packages/auth: validateSession, loginAction, logoutAction with "use server". ' +
    'middleware.ts matcher adds /dashboard/settings, /checkout/:path*, /api/admin/:path*. ' +
    'LoginForm migrates from REST fetch to Server Action via useFormState. ' +
    'Breaking: "login-submit-btn"→"auth-login-submit-btn", "login-error"→"auth-login-error". ' +
    'Behavioral break: /dashboard/settings now requires auth — E2E tests that visited it unauthenticated break.',
  author: 'julia',
  branch: 'feat/auth-middleware-server-actions',
  commitSha: 'j0k1l2m3n4o5j0k1l2m3n4o5j0k1l2m3n4o5j0k1',
  baseSha: '999999999999999999999999999999999999999',
  createdAt: '2024-06-01T08:00:00Z',
  mergedAt: null,
}

// Archivo 1: apps/web/middleware.ts — matcher expandido
export const MIDDLEWARE_CHUNK: ASTChunk = {
  filename: 'apps/web/middleware.ts',
  rawDiff: [
    '-import { NextResponse } from "next/server"',
    '-import type { NextRequest } from "next/server"',
    '-export function middleware(req: NextRequest) {',
    '-  const token = req.cookies.get("session")?.value',
    '-  if (!token) return NextResponse.redirect(new URL("/login", req.url))',
    '-  return NextResponse.next()',
    '-}',
    '-export const config = { matcher: ["/dashboard/:path*", "/profile/:path*"] }',
    '+import { NextResponse } from "next/server"',
    '+import type { NextRequest } from "next/server"',
    '+import { validateSession } from "@company/auth"',
    '+',
    '+export async function middleware(req: NextRequest) {',
    '+  const token = req.cookies.get("session")?.value',
    '+  if (!token) {',
    '+    const url = new URL("/login", req.url)',
    '+    url.searchParams.set("redirect", req.nextUrl.pathname)',
    '+    return NextResponse.redirect(url)',
    '+  }',
    '+  const session = await validateSession(token)',
    '+  if (!session.valid) {',
    '+    const url = new URL("/login", req.url)',
    '+    url.searchParams.set("redirect", req.nextUrl.pathname)',
    '+    url.searchParams.set("reason", "session_expired")',
    '+    return NextResponse.redirect(url)',
    '+  }',
    '+  const res = NextResponse.next()',
    '+  res.headers.set("X-Session-User", session.userId)',
    '+  return res',
    '+}',
    '+export const config = {',
    '+  matcher: [',
    '+    "/dashboard/:path*",',
    '+    "/profile/:path*",',
    '+    "/dashboard/settings",   // NEW',
    '+    "/checkout/:path*",      // NEW',
    '+    "/api/admin/:path*",     // NEW',
    '+  ],',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    [
      'import { validateSession } from "@company/auth"',
      'export async function middleware(req: NextRequest)',
      'url.searchParams.set("redirect", req.nextUrl.pathname)',
      'const session = await validateSession(token)',
      'if (!session.valid) { url.searchParams.set("reason", "session_expired") }',
      'res.headers.set("X-Session-User", session.userId)',
      '"/dashboard/settings",   // NEW',
      '"/checkout/:path*",      // NEW',
      '"/api/admin/:path*",     // NEW',
    ],
    [
      'export function middleware(req: NextRequest)',
      'if (!token) return NextResponse.redirect(new URL("/login", req.url))',
      'matcher: ["/dashboard/:path*", "/profile/:path*"]',
    ]
  )],
  components: [],
  functions: ['middleware', 'validateSession', 'NextResponse.redirect', 'NextResponse.next'],
  jsxChanges: [],
  testIds: [],
  summary: 'Middleware expanded: validates session via packages/auth validateSession. Matcher adds /dashboard/settings, /checkout/:path*, /api/admin/:path*. Redirect carries "redirect" and "reason" query params. X-Session-User header forwarded.',
}

// Archivo 2: packages/auth/src/index.ts — Server Actions ("use server")
export const AUTH_PKG_CHUNK: ASTChunk = {
  filename: 'packages/auth/src/index.ts',
  rawDiff: [
    '+"use server"',
    '+import { cookies, headers } from "next/headers"',
    '+import { redirect } from "next/navigation"',
    '+',
    '+export interface Session { valid: boolean; userId: string; role: "admin" | "user" | "guest"; expiresAt: number }',
    '+',
    '+export async function validateSession(token: string): Promise<Session> {',
    '+  const res = await fetch(`${process.env.AUTH_SERVICE_URL}/validate`, {',
    '+    method: "POST", body: JSON.stringify({ token }), cache: "no-store",',
    '+  })',
    '+  if (!res.ok) return { valid: false, userId: "", role: "guest", expiresAt: 0 }',
    '+  return res.json() as Promise<Session>',
    '+}',
    '+',
    '+export async function loginAction(formData: FormData): Promise<void> {',
    '+  const res = await fetch(`${process.env.AUTH_SERVICE_URL}/login`, {',
    '+    method: "POST",',
    '+    body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") }),',
    '+    cache: "no-store",',
    '+  })',
    '+  if (!res.ok) throw new Error("Invalid credentials")',
    '+  const { token, expiresAt } = await res.json() as { token: string; expiresAt: number }',
    '+  cookies().set("session", token, { httpOnly: true, secure: true, sameSite: "lax", expires: new Date(expiresAt) })',
    '+  redirect(headers().get("x-redirect") ?? "/dashboard")',
    '+}',
    '+',
    '+export async function logoutAction(): Promise<void> {',
    '+  const tok = cookies().get("session")?.value',
    '+  if (tok) await fetch(`${process.env.AUTH_SERVICE_URL}/logout`, { method: "POST", body: JSON.stringify({ token: tok }), cache: "no-store" }).catch(() => void 0)',
    '+  cookies().delete("session")',
    '+  redirect("/login")',
    '+}',
  ].join('\n'),
  hunks: [hunk([
    '"use server"',
    'export async function validateSession(token: string): Promise<Session>',
    'export async function loginAction(formData: FormData): Promise<void>',
    'cookies().set("session", token, { httpOnly: true, secure: true, sameSite: "lax" })',
    'redirect(headers().get("x-redirect") ?? "/dashboard")',
    'export async function logoutAction(): Promise<void>',
    'cookies().delete("session")',
  ])],
  components: [],
  functions: ['validateSession', 'loginAction', 'logoutAction', 'cookies', 'headers', 'redirect'],
  jsxChanges: [],
  testIds: [],
  summary: 'New packages/auth with "use server". validateSession calls AUTH_SERVICE_URL. loginAction uses cookies() + redirect() instead of REST endpoint. logoutAction clears session and redirects. No JSX — pure server logic.',
}

// Archivo 3: apps/web/app/login/LoginForm.tsx — migra a Server Action + useFormState
export const LOGIN_FORM_CHUNK: ASTChunk = {
  filename: 'apps/web/app/login/LoginForm.tsx',
  rawDiff: [
    '-"use client"',
    '-import { useState } from "react"',
    '-export function LoginForm() {',
    '-  const [error, setError] = useState<string | null>(null)',
    '-  const [loading, setLoading] = useState(false)',
    '-  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {',
    '-    e.preventDefault(); setLoading(true)',
    '-    try { const res = await fetch("/api/auth/login", { method: "POST", body: new FormData(e.currentTarget) })',
    '-      if (!res.ok) setError("Invalid credentials")',
    '-    } catch { setError("Network error") } finally { setLoading(false) }',
    '-  }',
    '-  return (',
    '-    <form data-test-id="login-form" onSubmit={handleSubmit}>',
    '-      <input data-test-id="login-email-input" name="email" type="email" />',
    '-      <input data-test-id="login-password-input" name="password" type="password" />',
    '-      {error && <div data-test-id="login-error">{error}</div>}',
    '-      <button data-test-id="login-submit-btn" type="submit" disabled={loading}>Sign in</button>',
    '-    </form>',
    '-  )',
    '-}',
    '+"use client"',
    '+import { useFormState, useFormStatus } from "react-dom"',
    '+import { loginAction } from "@company/auth"',
    '+',
    '+function SubmitButton() {',
    '+  const { pending } = useFormStatus()',
    '+  return (',
    '+    <button data-test-id="auth-login-submit-btn" type="submit" disabled={pending} aria-busy={pending}>',
    '+      {pending ? "Signing in..." : "Sign in"}',
    '+    </button>',
    '+  )',
    '+}',
    '+',
    '+export function LoginForm() {',
    '+  const [state, formAction] = useFormState(loginAction, null)',
    '+  return (',
    '+    <form data-test-id="login-form" action={formAction}>',
    '+      <input data-test-id="login-email-input" name="email" type="email" required />',
    '+      <input data-test-id="login-password-input" name="password" type="password" required />',
    '+      {state?.error && <div data-test-id="auth-login-error" role="alert">{state.error}</div>}',
    '+      <div data-test-id="auth-session-banner" aria-live="polite" />',
    '+      <SubmitButton />',
    '+    </form>',
    '+  )',
    '+}',
  ].join('\n'),
  hunks: [hunk(
    [
      'import { useFormState, useFormStatus } from "react-dom"',
      'import { loginAction } from "@company/auth"',
      'function SubmitButton() { const { pending } = useFormStatus() }',
      '<button data-test-id="auth-login-submit-btn" type="submit" disabled={pending}>',
      '<div data-test-id="auth-login-error" role="alert">',
      '<div data-test-id="auth-session-banner" aria-live="polite" />',
      'const [state, formAction] = useFormState(loginAction, null)',
    ],
    [
      'async function handleSubmit(e: React.FormEvent<HTMLFormElement>)',
      'await fetch("/api/auth/login", { method: "POST" })',
      '<button data-test-id="login-submit-btn" type="submit" disabled={loading}>',
      '<div data-test-id="login-error">',
    ]
  )],
  components: ['LoginForm', 'SubmitButton'],
  functions: ['loginAction', 'useFormState', 'useFormStatus'],
  jsxChanges: [
    { element: 'button', attribute: 'data-test-id', addedValue: 'auth-login-submit-btn', removedValue: 'login-submit-btn' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'auth-login-error', removedValue: 'login-error' },
    { element: 'div', attribute: 'data-test-id', addedValue: 'auth-session-banner' },
  ],
  testIds: ['auth-login-submit-btn', 'auth-login-error', 'auth-session-banner', 'login-submit-btn', 'login-error', 'login-form', 'login-email-input', 'login-password-input'],
  summary: 'LoginForm migrated from REST fetch to Server Action loginAction via useFormState. "login-submit-btn"→"auth-login-submit-btn". "login-error"→"auth-login-error". Adds "auth-session-banner" aria-live region. SubmitButton uses useFormStatus for pending state.',
}

export const AUTH_MIDDLEWARE_SPEC_FILES: SpecFile[] = [
  {
    name: 'apps/web/auth-login.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Login — Server Action migration', () => {
  test('should sign in via login-submit-btn (OLD selector)', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-email-input').fill('alice@test.com')
    await page.getByTestId('login-password-input').fill('correct-password')
    await page.getByTestId('login-submit-btn').click()
    await expect(page).toHaveURL('/dashboard')
  })

  test('should sign in via auth-login-submit-btn (NEW selector)', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-email-input').fill('alice@test.com')
    await page.getByTestId('login-password-input').fill('correct-password')
    await page.getByTestId('auth-login-submit-btn').click()
    await expect(page).toHaveURL('/dashboard')
  })

  test('should show auth-login-error on bad credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-email-input').fill('bad@test.com')
    await page.getByTestId('login-password-input').fill('wrong')
    await page.getByTestId('auth-login-submit-btn').click()
    await expect(page.getByTestId('auth-login-error')).toBeVisible()
  })

  test('should show login-error (OLD selector — renamed)', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-email-input').fill('bad@test.com')
    await page.getByTestId('login-password-input').fill('wrong')
    await page.getByTestId('auth-login-submit-btn').click()
    await expect(page.getByTestId('login-error')).toBeVisible()
  })

  test('should show auth-session-banner when redirected with reason=session_expired', async ({ page }) => {
    await page.goto('/login?reason=session_expired')
    await expect(page.getByTestId('auth-session-banner')).toBeVisible()
  })
})
    `.trim(),
  },
  {
    name: 'apps/web/middleware-routes.spec.ts',
    content: `
import { test, expect } from '@playwright/test'

test.describe('Middleware — expanded route protection', () => {
  test('should access /dashboard/settings without auth (before matcher expansion)', async ({ page }) => {
    await page.goto('/dashboard/settings')
    await expect(page).toHaveURL('/dashboard/settings')
    await expect(page.getByTestId('settings-panel')).toBeVisible()
  })

  test('should redirect /dashboard/settings to /login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard/settings')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.url()).toContain('redirect=%2Fdashboard%2Fsettings')
  })

  test('should redirect /checkout to /login when session expired', async ({ page }) => {
    await page.context().addCookies([{ name: 'session', value: 'expired-token', url: 'http://localhost:3000' }])
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.url()).toContain('reason=session_expired')
  })

  test('should allow /dashboard/settings with valid session', async ({ page }) => {
    test.use({ storageState: 'playwright/.auth/user.json' })
    await page.goto('/dashboard/settings')
    await expect(page).toHaveURL('/dashboard/settings')
  })
})
    `.trim(),
  },
]

export const AUTH_MIDDLEWARE_PREDICTIONS: AnalyzeResult[] = [
  {
    test: 'should sign in via login-submit-btn (OLD selector)',
    file: 'apps/web/auth-login.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"login-submit-btn" renamed to "auth-login-submit-btn" in LoginForm Server Action migration',
  },
  {
    test: 'should show login-error (OLD selector — renamed)',
    file: 'apps/web/auth-login.spec.ts',
    line: 0,
    status: 'broken',
    reason: '"login-error" renamed to "auth-login-error" in LoginForm redesign',
  },
  {
    test: 'should access /dashboard/settings without auth (before matcher expansion)',
    file: 'apps/web/middleware-routes.spec.ts',
    line: 0,
    status: 'broken',
    reason: 'Middleware matcher now includes "/dashboard/settings" — unauthenticated requests redirect to /login; no selector change involved, purely behavioral breakage from middleware expansion',
  },
  {
    test: 'should sign in via auth-login-submit-btn (NEW selector)',
    file: 'apps/web/auth-login.spec.ts',
    line: 0,
    status: 'ok',
    reason: '"auth-login-submit-btn" is the new correct selector using useFormStatus pending state',
  },
  {
    test: 'should redirect /dashboard/settings to /login when unauthenticated',
    file: 'apps/web/middleware-routes.spec.ts',
    line: 0,
    status: 'ok',
    reason: 'Middleware now guards /dashboard/settings — redirect with "redirect" param is the expected new behavior',
  },
  {
    test: 'should show auth-session-banner when redirected with reason=session_expired',
    file: 'apps/web/auth-login.spec.ts',
    line: 0,
    status: 'ok',
    reason: '"auth-session-banner" is a new aria-live element in LoginForm — shown when reason=session_expired param present',
  },
  {
    test: 'should redirect /checkout to /login when session expired',
    file: 'apps/web/middleware-routes.spec.ts',
    line: 0,
    status: 'risk',
    reason: 'validateSession calls external AUTH_SERVICE_URL from middleware — E2E environment must have a running auth service or mock; unexpected 500 instead of redirect in unconfigured environments',
  },
]
