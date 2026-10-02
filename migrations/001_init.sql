-- Go Echo Admin v0.1 baseline schema for MySQL 8.4.
-- The application also runs GORM AutoMigrate so this file is safe for a fresh Compose volume.
CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(64) NOT NULL,
  domain VARCHAR(255) NULL,
  contact VARCHAR(120) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_tenants_code (code), UNIQUE KEY ux_tenants_domain (domain), KEY ix_tenants_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(32) NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(120) NULL,
  avatar VARCHAR(512) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_users_username (username), UNIQUE KEY ux_users_email (email), KEY ix_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tenant_memberships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  password_hash VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  primary_department_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_membership_tenant_user (tenant_id,user_id), KEY ix_membership_user (user_id),
  CONSTRAINT fk_membership_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(80) NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  leader_id BIGINT UNSIGNED NULL,
  sort INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_department_tenant_code (tenant_id,code), KEY ix_department_parent (parent_id),
  CONSTRAINT fk_department_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS positions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(80) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_position_tenant_code (tenant_id,code), KEY ix_position_tenant (tenant_id),
  CONSTRAINT fk_position_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS department_members (
  tenant_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (tenant_id,department_id,user_id), KEY ix_department_member_user (tenant_id,user_id),
  CONSTRAINT fk_department_member_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_department_member_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS position_members (
  tenant_id BIGINT UNSIGNED NOT NULL,
  position_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (tenant_id,position_id,user_id), KEY ix_position_member_user (tenant_id,user_id),
  CONSTRAINT fk_position_member_position FOREIGN KEY (position_id) REFERENCES positions(id),
  CONSTRAINT fk_position_member_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS iam_user_profiles (
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  nickname VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(32) NOT NULL DEFAULT '',
  email VARCHAR(190) NULL,
  avatar VARCHAR(512) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  password_hash VARCHAR(255) NULL,
  PRIMARY KEY (tenant_id,user_id), KEY ix_iam_profile_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS iam_menu_settings (
  tenant_id BIGINT UNSIGNED NOT NULL,
  menu_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT '',
  icon VARCHAR(120) NOT NULL DEFAULT '',
  keep_alive BOOLEAN NOT NULL DEFAULT TRUE,
  default_menu BOOLEAN NOT NULL DEFAULT FALSE,
  close_tab BOOLEAN NOT NULL DEFAULT FALSE,
  component VARCHAR(255) NULL,
  parameters TEXT NULL,
  PRIMARY KEY (tenant_id,menu_id), KEY ix_iam_menu_settings_menu (menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS iam_menu_buttons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  menu_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_iam_menu_button (tenant_id,menu_id,name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS iam_role_buttons (
  tenant_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  button_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (tenant_id,role_id,button_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS iam_role_apis (
  tenant_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  api_resource_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (tenant_id,role_id,api_resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS iam_role_settings (
  tenant_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  default_router VARCHAR(255) NOT NULL DEFAULT '',
  data_authority_ids TEXT NULL,
  data_scope VARCHAR(40) NOT NULL DEFAULT 'all',
  PRIMARY KEY (tenant_id,role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_roles_tenant_name (tenant_id,name), KEY ix_roles_tenant (tenant_id),
  CONSTRAINT fk_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS role_memberships (
  role_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id,user_id), KEY ix_role_membership_tenant (tenant_id),
  CONSTRAINT fk_rm_role FOREIGN KEY (role_id) REFERENCES roles(id), CONSTRAINT fk_rm_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS menus (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  type VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  path VARCHAR(255) NULL,
  route_name VARCHAR(120) NULL,
  icon VARCHAR(120) NULL,
  permission VARCHAR(160) NULL,
  sort INT NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  cache BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), KEY ix_menus_tenant (tenant_id), KEY ix_menus_parent (parent_id), KEY ix_menus_permission (permission),
  CONSTRAINT fk_menus_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  resource VARCHAR(120) NULL,
  action VARCHAR(80) NULL,
  method VARCHAR(10) NULL,
  path VARCHAR(255) NULL,
  result VARCHAR(20) NULL,
  request_id VARCHAR(80) NULL,
  ip VARCHAR(64) NULL,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  changes TEXT NULL,
  status_code INT NOT NULL DEFAULT 0,
  agent VARCHAR(512) NULL,
  error_message VARCHAR(500) NULL,
  trace_id VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), KEY ix_audit_tenant (tenant_id), KEY ix_audit_request (request_id), KEY ix_audit_created (created_at), KEY ix_audit_trace (trace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_menus (
  role_id BIGINT UNSIGNED NOT NULL,
  menu_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id,menu_id), KEY ix_role_menu_tenant (tenant_id),
  CONSTRAINT fk_role_menu_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_role_menu_menu FOREIGN KEY (menu_id) REFERENCES menus(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_resources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(255) NOT NULL,
  `group` VARCHAR(80) NULL,
  permission VARCHAR(160) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_api_method_path (method,path), KEY ix_api_permission (permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_api_grants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  api_resource_id BIGINT UNSIGNED NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_tenant_api (tenant_id,api_resource_id), KEY ix_tenant_api_resource (api_resource_id),
  CONSTRAINT fk_tenant_api_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_tenant_api_resource FOREIGN KEY (api_resource_id) REFERENCES api_resources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dictionaries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  description VARCHAR(500) NULL,
  parent_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_tenant_dict_type (tenant_id,`type`), KEY ix_dict_parent (parent_id),
  CONSTRAINT fk_dict_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dictionary_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  dictionary_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(120) NOT NULL,
  value VARCHAR(120) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  extend TEXT NULL,
  parent_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_tenant_dict_item (tenant_id,dictionary_id,value), KEY ix_dict_item_parent (parent_id),
  CONSTRAINT fk_dict_item_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_dict_item_dictionary FOREIGN KEY (dictionary_id) REFERENCES dictionaries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_params (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  `key` VARCHAR(120) NOT NULL,
  value TEXT NULL,
  sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  description VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_tenant_param_key (tenant_id,`key`),
  CONSTRAINT fk_param_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_login_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  tenant_code VARCHAR(64) NULL,
  domain VARCHAR(255) NULL,
  ip VARCHAR(64) NULL,
  device VARCHAR(255) NULL,
  result VARCHAR(20) NULL,
  failure_reason VARCHAR(255) NULL,
  request_id VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), KEY ix_platform_login_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_login_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  username VARCHAR(80) NULL,
  ip VARCHAR(64) NULL,
  device VARCHAR(255) NULL,
  result VARCHAR(20) NULL,
  failure_reason VARCHAR(255) NULL,
  request_id VARCHAR(80) NULL,
  trace_id VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), KEY ix_tenant_login_tenant (tenant_id), KEY ix_tenant_login_created (created_at), KEY ix_tenant_login_trace (trace_id),
  CONSTRAINT fk_tenant_login_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_refresh_token_hash (token_hash), KEY ix_refresh_user (user_id), KEY ix_refresh_tenant (tenant_id), KEY ix_refresh_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
