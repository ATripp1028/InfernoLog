export function Login() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '16px' }}>
            <h1>InfernoLog</h1>
            <button onClick={() => alert('Sign in with Google')}>Sign in with Google</button>
        </div>
    )
}