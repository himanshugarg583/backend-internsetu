import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { asyncHandler } from '../utils/helpers';
import { clearRefreshCookie, ok, REFRESH_COOKIE, setRefreshCookie, v } from '../utils/http';

const GENERIC_OTP_MSG = 'If the account exists, a verification code has been sent';

export const authController = {
  register: asyncHandler(async (_req, res) =>
    ok(res, await authService.register(v(res).body), 'Account created successfully. Please verify your email with the OTP sent.', 201),
  ),

  login: asyncHandler(async (_req, res) => {
    const { email, password } = v(res).body;
    const { user, accessToken, refreshToken } = await authService.login(email, password);
    setRefreshCookie(res, refreshToken);
    ok(res, { user, accessToken, refreshToken }, 'Login successful');
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const tokens = await authService.refresh(v(res).body.refreshToken ?? req.cookies?.[REFRESH_COOKIE]);
    setRefreshCookie(res, tokens.refreshToken);
    ok(res, tokens, 'Session refreshed successfully');
  }),

  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.user!.id);
    clearRefreshCookie(res);
    ok(res, { loggedOut: true }, 'Logged out successfully');
  }),

  sendOtp: asyncHandler(async (_req, res) => {
    const { email, purpose } = v(res).body;
    await authService.sendOtp(email, purpose);
    ok(res, { message: GENERIC_OTP_MSG }, GENERIC_OTP_MSG);
  }),

  verifyOtp: asyncHandler(async (_req, res) => {
    const { email, otp } = v(res).body;
    ok(res, await authService.verifyEmail(email, otp), 'Email verified successfully');
  }),

  forgot: asyncHandler(async (_req, res) => {
    await authService.forgotPassword(v(res).body.email);
    ok(res, { message: GENERIC_OTP_MSG }, GENERIC_OTP_MSG);
  }),

  reset: asyncHandler(async (_req, res) => {
    const { email, otp, newPassword } = v(res).body;
    await authService.resetPassword(email, otp, newPassword);
    clearRefreshCookie(res);
    ok(res, { message: 'Password updated. Please log in again.' }, 'Password updated successfully. Please log in again.');
  }),

  changePassword: asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = v(res).body;
    await authService.changePassword(req.user!.id, currentPassword, newPassword);
    clearRefreshCookie(res);
    ok(res, { message: 'Password changed. Please log in again.' }, 'Password changed successfully. Please log in again.');
  }),

  me: asyncHandler(async (req, res) => ok(res, await userService.me(req.user!.id), 'Profile retrieved successfully')),
};
