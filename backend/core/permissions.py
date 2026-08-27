from rest_framework.permissions import BasePermission, SAFE_METHODS

FULL_ACCESS_ROLES = {'TI', 'Admin'}
MOTORISTA_PORTAL_ROLES = {'Motorista', 'Ajudante'}

ROLE_ALIASES = {
    'administrador': 'Admin',
    'administrador do sistema': 'Admin',
    'gestor operacional': 'Gestor',
    'gestor': 'Gestor',
    'operacional': 'Operacional',
    'motorista': 'Motorista',
    'ajudante': 'Ajudante',
    'ti': 'TI',
    'admin': 'Admin',
}


def normalize_role(value):
    if value is None:
        return ''

    normalized = str(value).strip().lower().replace('_', ' ').replace('-', ' ')
    return ROLE_ALIASES.get(normalized, str(value).strip())


def user_has_role(user, roles):
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return normalize_role(getattr(user, 'role', '')) in set(roles)


def role_matches_any(value, roles):
    return normalize_role(value) in set(roles)


class IsFullAccessUser(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and user_has_role(request.user, FULL_ACCESS_ROLES)
        )


class CanManageUsers(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser or request.user.is_staff:
            return True

        if user_has_role(request.user, FULL_ACCESS_ROLES):
            return True

        return request.method in SAFE_METHODS


class IsMotoristaPortalUser(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and user_has_role(request.user, MOTORISTA_PORTAL_ROLES)
        )
