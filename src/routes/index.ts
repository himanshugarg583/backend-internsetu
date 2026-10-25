import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authController } from '../controllers/auth.controller';
import { certificateController } from '../controllers/certificate.controller';
import { domainController } from '../controllers/domain.controller';
import { internshipController } from '../controllers/internship.controller';
import { offerLetterController } from '../controllers/offerLetter.controller';
import { paymentController } from '../controllers/payment.controller';
import { submissionController } from '../controllers/submission.controller';
import { taskController } from '../controllers/task.controller';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { authLimiter, otpLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as A from '../validators/auth.validation';
import { idParams } from '../validators/common';
import * as D from '../validators/domain.validation';
import * as I from '../validators/internship.validation';
import * as P from '../validators/payment.validation';
import * as T from '../validators/task.validation';
import * as U from '../validators/user.validation';

const router = Router();
const student = [authenticate, authorize('STUDENT')];
const anyUser = [authenticate, authorize('STUDENT', 'ADMIN')];
const byId = validate({ params: idParams });

// Auth
router.post('/auth/register', authLimiter, validate(A.registerSchema), authController.register);
router.post('/auth/login', authLimiter, validate(A.loginSchema), authController.login);
router.post('/auth/refresh', authLimiter, validate(A.refreshSchema), authController.refresh);
router.post('/auth/logout', authenticate, authController.logout);
router.post('/auth/otp/send', otpLimiter, validate(A.otpSendSchema), authController.sendOtp);
router.post('/auth/otp/verify', otpLimiter, validate(A.otpVerifySchema), authController.verifyOtp);
router.post('/auth/password/forgot', otpLimiter, validate(A.forgotSchema), authController.forgot);
router.post('/auth/password/reset', otpLimiter, validate(A.resetSchema), authController.reset);
router.post('/auth/password/change', authLimiter, authenticate, validate(A.changePasswordSchema), authController.changePassword);
router.get('/auth/me', authenticate, authController.me);

// Student / shared
router.patch('/me', authenticate, validate(U.updateMeSchema), userController.updateMe);
router.get('/domains', validate(D.listDomainsSchema), domainController.list);
router.get('/domains/:slug', validate(D.domainSlugSchema), domainController.getBySlug);

router.post('/internships/enroll', ...student, validate(I.enrollSchema), internshipController.enroll);
router.get('/internships/my', ...student, internshipController.listMine);
router.get('/internships/:id', ...anyUser, byId, internshipController.get);
router.get('/internships/:id/tasks', ...anyUser, byId, taskController.listForEnrollment);
router.get('/internships/:id/progress', ...anyUser, byId, internshipController.progress);
router.get('/internships/:id/offer-letter', ...anyUser, byId, offerLetterController.download);
router.post('/internships/:id/tasks/:taskId/submissions', ...student, validate(T.submitTaskSchema), submissionController.submit);
router.get('/internships/:id/certificate/eligibility', ...anyUser, byId, internshipController.eligibility);
router.post('/internships/:id/certificate/payment-order', ...student, byId, paymentController.createOrder);

router.get('/payments/my', ...student, paymentController.listMine);
router.post('/payments/verify', ...student, validate(P.clientVerifySchema), paymentController.verify);
router.get('/payments/:id/receipt', ...anyUser, byId, paymentController.receipt);
router.get('/payments/:id', ...anyUser, byId, paymentController.get);
router.get('/certificates/my', ...student, certificateController.listMine);
router.get('/certificates/verify/:uniqueId', validate(P.verifySchema), certificateController.verify);
router.get('/certificates/:id/download', ...anyUser, byId, certificateController.download);
// Note: /payments/webhook/razorpay is mounted in app.ts with a raw body parser.

// Admin
const admin = Router();
admin.use(authenticate, authorize('ADMIN'));
admin.get('/dashboard/stats', adminController.stats);
admin.get('/users', validate(U.adminListUsersSchema), userController.adminList);
admin.post('/users', validate(U.adminCreateUserSchema), userController.adminCreate);
admin.get('/users/:id', byId, userController.adminGet);
admin.patch('/users/:id/status', validate(U.adminUserStatusSchema), userController.adminSetStatus);
admin.get('/domains', validate(D.listDomainsSchema), domainController.adminList);
admin.post('/domains', validate(D.createDomainSchema), domainController.adminCreate);
admin.get('/domains/:id', byId, domainController.adminGet);
admin.patch('/domains/:id', validate(D.updateDomainSchema), domainController.adminUpdate);
admin.patch('/domains/:id/status', validate(D.domainStatusSchema), domainController.adminSetStatus);
admin.get('/domains/:id/tasks', byId, taskController.adminList);
admin.post('/domains/:id/tasks', validate(T.createTaskSchema), taskController.adminCreate);
admin.get('/tasks', validate(T.adminListTasksSchema), taskController.adminListAll);
admin.patch('/tasks/:id', validate(T.updateTaskSchema), taskController.adminUpdate);
admin.patch('/tasks/:id/status', validate(T.taskStatusSchema), taskController.adminSetStatus);
admin.get('/internships', validate(I.adminListInternshipsSchema), internshipController.adminList);
admin.get('/internships/:id', byId, internshipController.adminGet);
admin.post('/internships/:id/certificate', byId, certificateController.adminIssue);
admin.get('/task-submissions', validate(T.listSubmissionsSchema), submissionController.adminList);
admin.get('/task-submissions/:id', byId, submissionController.adminGet);
admin.post('/task-submissions/:id/approve', validate(T.approveSchema), submissionController.approve);
admin.post('/task-submissions/:id/reject', validate(T.rejectSchema), submissionController.reject);
admin.get('/payments', validate(P.listPaymentsSchema), paymentController.adminList);
admin.get('/payments/:id', byId, paymentController.get);
admin.post('/payments/:id/refund', validate(P.refundSchema), paymentController.adminRefund);
admin.get('/certificates', validate(P.listCertificatesSchema), certificateController.adminList);
admin.get('/certificates/:id', byId, certificateController.adminGet);
admin.post('/certificates/:id/revoke', validate(P.revokeSchema), certificateController.revoke);
admin.get('/reports/payments', validate(P.reportSchema), adminController.paymentReport);
admin.get('/reports/registrations', validate(P.reportSchema), adminController.registrationReport);
admin.get('/reports/overview', validate(P.reportSchema), adminController.reportsOverview);
admin.get('/reports/domain-enrollments', validate(P.reportSchema), adminController.domainEnrollmentsReport);
admin.get('/reports/internship-status', validate(P.reportSchema), adminController.internshipStatusReport);
admin.get('/reports/task-completion', validate(P.taskReportSchema), adminController.taskCompletionReport);
admin.get('/reports/certificates', validate(P.reportSchema), adminController.certificatesReport);
admin.get('/reports/payment-status', validate(P.reportSchema), adminController.paymentStatusReport);
admin.get('/activity', validate(P.activitySchema), adminController.activity);
admin.get('/settings', adminController.getSettings);
admin.patch('/settings', validate(P.updateSettingsSchema), adminController.updateSettings);
router.use('/admin', admin);

export default router;
