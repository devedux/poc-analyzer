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
