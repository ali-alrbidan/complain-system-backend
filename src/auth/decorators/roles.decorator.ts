// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

import { ROLES_KEY } from '../guards/roles.guard';
import { UserRole } from '../../../generated/prisma/enums';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
