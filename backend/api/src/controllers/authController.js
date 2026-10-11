import { authService, getConfig } from '@supportflow/shared';

function setRefreshCookie(res, token, expiresAt) {
  const config = getConfig();
  res.cookie('sf_refresh', token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/v1/auth',
    expires: expiresAt
  });
}

function clearRefreshCookie(res) {
  const config = getConfig();
  res.clearCookie('sf_refresh', {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/v1/auth'
  });
}

export class AuthController {
  async register(req, res, next) {
    try {
      const { email, password, fullName } = req.body;
      const result = await authService.register({
        email,
        password,
        fullName,
        ip: req.ip,
        requestId: req.id
      });
      res.status(201).json({ data: result.user });
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await authService.login({
        email,
        password,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        requestId: req.id
      });

      setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

      res.status(200).json({
        data: {
          accessToken: result.accessToken,
          user: result.user
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const token = req.cookies?.sf_refresh;
      const result = await authService.refresh({
        refreshToken: token,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        requestId: req.id
      });

      setRefreshCookie(res, result.newRefreshToken, result.refreshExpiresAt);

      res.status(200).json({
        data: {
          accessToken: result.accessToken
        }
      });
    } catch (err) {
      clearRefreshCookie(res);
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      const token = req.cookies?.sf_refresh;
      await authService.logout({
        refreshToken: token,
        user: req.user,
        ip: req.ip,
        requestId: req.id
      });

      clearRefreshCookie(res);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword({
        userId: req.user.id,
        currentPassword,
        newPassword,
        ip: req.ip,
        requestId: req.id
      });

      clearRefreshCookie(res);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async me(req, res, next) {
    try {
      res.status(200).json({
        data: {
          user: req.user
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
