import Nav from '../components/Nav';
import Guard from '../components/Guard';

export default function Login() {
  return (
    <main>
      <Nav />
      <h2>Login</h2>
      <Guard><p>Signed in.</p></Guard>
    </main>
  );
}
