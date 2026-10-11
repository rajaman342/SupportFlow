import { verifyAccessToken, userRepository, UnauthenticatedError } from '@supportflow/shared';

export async function authenticateMiddleware(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthenticatedError('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyAccessToken(token);

    // Non-negotiable security requirement:
    // Load fresh user row from DB on every request to derive role & org securely
    const user = await userRepository.findById(payload.sub);
    if (!user || !user.is_active) {
      throw new UnauthenticatedError('User account is deactivated or no longer exists');
    }

    req.user = {
      id: user.id,
      organizationId: user.organization_id,
      role: user.role,
      email: user.email,
      fullName: user.full_name
    };

    next();
  } catch (err) {
    next(err);
  }
}
