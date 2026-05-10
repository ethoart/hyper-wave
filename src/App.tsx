/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProvider, useAuth } from './components/AuthProvider';
import { Route, Switch } from 'wouter';
import { ShareChart } from './components/ShareChart';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import axios from 'axios';

axios.defaults.withCredentials = true;

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }

  return user ? <Dashboard /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Switch>
        <Route path="/chart/:id" component={ShareChart} />
        <Route path="/">
           <AppContent />
        </Route>
      </Switch>
    </AuthProvider>
  );
}
