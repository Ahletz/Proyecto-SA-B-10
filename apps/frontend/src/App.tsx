import{
  BrowserRouter,
  Routes,
  Route,
  Navigate
}from'react-router-dom';

import{HomePage}from'./pages/HomePage';
import{LoginPage}from'./pages/LoginPage';
import{RegisterPage}from'./pages/RegisterPage';
import{ActivationPage}from'./pages/ActivationPage';
import{ProfilePage}from'./pages/ProfilePage';
import{AccountsPage}from'./pages/AccountsPage';
import{TransferPage}from'./pages/TransferPage';
import{TransactionHistoryPage}from'./pages/TransactionHistoryPage';
import{AuditPage}from'./pages/AuditPage';
import{PaymentsPage}from'./pages/PaymentsPage';
import{NotificationsPage}from'./pages/NotificationsPage';
import{ProtectedRoute}from'./components/ProtectedRoute';
import{AppLayout}from'./components/AppLayout';

import'./App.css';

/*
 * `/` muestra la portada pública sin sesión y el inicio dentro del
 * shell con sesión. El resto de rutas privadas comparten AppLayout;
 * los roles coinciden con NAV_ITEMS y con los @Roles del Gateway.
 */
export const App=()=>(
  <BrowserRouter>
    <Routes>
      <Route
        path="/"
        element={<HomePage/>}
      />

      <Route
        path="/login"
        element={<LoginPage/>}
      />

      <Route
        path="/register"
        element={<RegisterPage/>}
      />

      <Route
        path="/activate"
        element={<ActivationPage/>}
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout/>
          </ProtectedRoute>
        }
      >
        <Route
          path="/profile"
          element={<ProfilePage/>}
        />

        <Route
          path="/accounts"
          element={<AccountsPage/>}
        />

        <Route
          path="/transfer"
          element={
            <ProtectedRoute roles={['CLIENT']}>
              <TransferPage/>
            </ProtectedRoute>
          }
        />

        <Route
          path="/transactions"
          element={<TransactionHistoryPage/>}
        />

        <Route
          path="/audit"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AuditPage/>
            </ProtectedRoute>
          }
        />

        <Route
          path="/notifications"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <NotificationsPage/>
            </ProtectedRoute>
          }
        />

        <Route
          path="/payments"
          element={
            <ProtectedRoute
              roles={['ADMIN','CASHIER']}
            >
              <PaymentsPage/>
            </ProtectedRoute>
          }
        />
      </Route>

      <Route
        path="*"
        element={<Navigate to="/" replace/>}
      />
    </Routes>
  </BrowserRouter>
);
