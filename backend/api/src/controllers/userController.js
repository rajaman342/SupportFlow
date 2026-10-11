import { userService } from '@supportflow/shared';

export class UserController {
  async create(req, res, next) {
    try {
      const { email, fullName, role, temporaryPassword } = req.body;
      const user = await userService.createUser({
        organizationId: req.user.organizationId,
        email,
        fullName,
        role,
        temporaryPassword,
        actorId: req.user.id,
        ip: req.ip,
        requestId: req.id
      });
      res.status(201).json({ data: user });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const { q, role, active, page, limit } = req.query;
      const result = await userService.listUsers({
        organizationId: req.user.organizationId,
        q,
        role,
        active: active !== undefined ? active === 'true' : null,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20
      });

      res.status(200).json({
        data: result.users,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async updateRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const updated = await userService.changeRole({
        userId: id,
        organizationId: req.user.organizationId,
        newRole: role,
        actorId: req.user.id,
        ip: req.ip,
        requestId: req.id
      });
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  async updateActive(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const updated = await userService.toggleActive({
        userId: id,
        organizationId: req.user.organizationId,
        isActive,
        actorId: req.user.id,
        ip: req.ip,
        requestId: req.id
      });
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
