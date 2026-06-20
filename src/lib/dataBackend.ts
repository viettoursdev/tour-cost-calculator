// Flag-gated data gateway selector (Phase 4).
// Re-exports every data fb* function under its same name, selecting the Supabase
// (sb*) implementation when VITE_AUTH_BACKEND === 'supabase', else Firebase (fb*).
// Selector mirrors src/auth/backend.ts. Auth functions are NOT here — they route
// through authBackend (Phase 3). Production stays on Firebase until cutover (Phase 7).
import * as fb from './firebase';
import * as sb from './supabase';

const sbActive = import.meta.env.VITE_AUTH_BACKEND === 'supabase';

// Pure, backend-agnostic helpers exported identically by both gateways. Re-exported
// here so consumers that import them alongside fb* functions keep a single import.
export const generateQuoteCode = sbActive ? (sb.generateQuoteCode as typeof fb.generateQuoteCode) : fb.generateQuoteCode;
export const dmChatId = sbActive ? (sb.dmChatId as typeof fb.dmChatId) : fb.dmChatId;

export const fbAddThreadComment = sbActive ? (sb.sbAddThreadComment as typeof fb.fbAddThreadComment) : fb.fbAddThreadComment;
export const fbBackfillPaymentIndex = sbActive ? (sb.sbBackfillPaymentIndex as typeof fb.fbBackfillPaymentIndex) : fb.fbBackfillPaymentIndex;
export const fbBackfillWorkflowIndex = sbActive ? (sb.sbBackfillWorkflowIndex as typeof fb.fbBackfillWorkflowIndex) : fb.fbBackfillWorkflowIndex;
export const fbDeleteChatMessage = sbActive ? (sb.sbDeleteChatMessage as typeof fb.fbDeleteChatMessage) : fb.fbDeleteChatMessage;
export const fbDeleteDMCQuote = sbActive ? (sb.sbDeleteDMCQuote as typeof fb.fbDeleteDMCQuote) : fb.fbDeleteDMCQuote;
export const fbDeleteItinerary = sbActive ? (sb.sbDeleteItinerary as typeof fb.fbDeleteItinerary) : fb.fbDeleteItinerary;
export const fbDeleteMenu = sbActive ? (sb.sbDeleteMenu as typeof fb.fbDeleteMenu) : fb.fbDeleteMenu;
export const fbDeleteQuote = sbActive ? (sb.sbDeleteQuote as typeof fb.fbDeleteQuote) : fb.fbDeleteQuote;
export const fbDeleteVisaProc = sbActive ? (sb.sbDeleteVisaProc as typeof fb.fbDeleteVisaProc) : fb.fbDeleteVisaProc;
export const fbEditChatMessage = sbActive ? (sb.sbEditChatMessage as typeof fb.fbEditChatMessage) : fb.fbEditChatMessage;
export const fbEnsureChat = sbActive ? (sb.sbEnsureChat as typeof fb.fbEnsureChat) : fb.fbEnsureChat;
export const fbEnsureNotifThread = sbActive ? (sb.sbEnsureNotifThread as typeof fb.fbEnsureNotifThread) : fb.fbEnsureNotifThread;
export const fbGetContracts = sbActive ? (sb.sbGetContracts as typeof fb.fbGetContracts) : fb.fbGetContracts;
export const fbGetDMCQuoteProject = sbActive ? (sb.sbGetDMCQuoteProject as typeof fb.fbGetDMCQuoteProject) : fb.fbGetDMCQuoteProject;
export const fbGetItinerary = sbActive ? (sb.sbGetItinerary as typeof fb.fbGetItinerary) : fb.fbGetItinerary;
export const fbGetMenu = sbActive ? (sb.sbGetMenu as typeof fb.fbGetMenu) : fb.fbGetMenu;
export const fbGetQuoteProject = sbActive ? (sb.sbGetQuoteProject as typeof fb.fbGetQuoteProject) : fb.fbGetQuoteProject;
export const fbGetTourPayments = sbActive ? (sb.sbGetTourPayments as typeof fb.fbGetTourPayments) : fb.fbGetTourPayments;
export const fbGetVisaProc = sbActive ? (sb.sbGetVisaProc as typeof fb.fbGetVisaProc) : fb.fbGetVisaProc;
export const fbLogAudit = sbActive ? (sb.sbLogAudit as typeof fb.fbLogAudit) : fb.fbLogAudit;
export const fbMarkChatRead = sbActive ? (sb.sbMarkChatRead as typeof fb.fbMarkChatRead) : fb.fbMarkChatRead;
export const fbPullMasterRC = sbActive ? (sb.sbPullMasterRC as typeof fb.fbPullMasterRC) : fb.fbPullMasterRC;
export const fbPushContracts = sbActive ? (sb.sbPushContracts as typeof fb.fbPushContracts) : fb.fbPushContracts;
export const fbPushCustomers = sbActive ? (sb.sbPushCustomers as typeof fb.fbPushCustomers) : fb.fbPushCustomers;
export const fbPushFxRates = sbActive ? (sb.sbPushFxRates as typeof fb.fbPushFxRates) : fb.fbPushFxRates;
export const fbPushMasterRC = sbActive ? (sb.sbPushMasterRC as typeof fb.fbPushMasterRC) : fb.fbPushMasterRC;
export const fbPushNcc = sbActive ? (sb.sbPushNcc as typeof fb.fbPushNcc) : fb.fbPushNcc;
export const fbPushNccProducts = sbActive ? (sb.sbPushNccProducts as typeof fb.fbPushNccProducts) : fb.fbPushNccProducts;
export const fbPushNotifications = sbActive ? (sb.sbPushNotifications as typeof fb.fbPushNotifications) : fb.fbPushNotifications;
export const fbPushPois = sbActive ? (sb.sbPushPois as typeof fb.fbPushPois) : fb.fbPushPois;
export const fbPushVisaProjects = sbActive ? (sb.sbPushVisaProjects as typeof fb.fbPushVisaProjects) : fb.fbPushVisaProjects;
export const fbSaveDMCQuote = sbActive ? (sb.sbSaveDMCQuote as typeof fb.fbSaveDMCQuote) : fb.fbSaveDMCQuote;
export const fbSaveDMCQuoteState = sbActive ? (sb.sbSaveDMCQuoteState as typeof fb.fbSaveDMCQuoteState) : fb.fbSaveDMCQuoteState;
export const fbSaveItinerary = sbActive ? (sb.sbSaveItinerary as typeof fb.fbSaveItinerary) : fb.fbSaveItinerary;
export const fbSaveMenu = sbActive ? (sb.sbSaveMenu as typeof fb.fbSaveMenu) : fb.fbSaveMenu;
export const fbSaveQuote = sbActive ? (sb.sbSaveQuote as typeof fb.fbSaveQuote) : fb.fbSaveQuote;
export const fbSaveQuoteState = sbActive ? (sb.sbSaveQuoteState as typeof fb.fbSaveQuoteState) : fb.fbSaveQuoteState;
export const fbSaveRestaurants = sbActive ? (sb.sbSaveRestaurants as typeof fb.fbSaveRestaurants) : fb.fbSaveRestaurants;
export const fbSaveTourPayments = sbActive ? (sb.sbSaveTourPayments as typeof fb.fbSaveTourPayments) : fb.fbSaveTourPayments;
export const fbSaveVisaProc = sbActive ? (sb.sbSaveVisaProc as typeof fb.fbSaveVisaProc) : fb.fbSaveVisaProc;
export const fbSaveVisaProducts = sbActive ? (sb.sbSaveVisaProducts as typeof fb.fbSaveVisaProducts) : fb.fbSaveVisaProducts;
export const fbSendChatMessage = sbActive ? (sb.sbSendChatMessage as typeof fb.fbSendChatMessage) : fb.fbSendChatMessage;
export const fbSendNotification = sbActive ? (sb.sbSendNotification as typeof fb.fbSendNotification) : fb.fbSendNotification;
export const fbSendNotificationMany = sbActive ? (sb.sbSendNotificationMany as typeof fb.fbSendNotificationMany) : fb.fbSendNotificationMany;
export const fbSetApprovalStage = sbActive ? (sb.sbSetApprovalStage as typeof fb.fbSetApprovalStage) : fb.fbSetApprovalStage;
export const fbSetDMCEntryLink = sbActive ? (sb.sbSetDMCEntryLink as typeof fb.fbSetDMCEntryLink) : fb.fbSetDMCEntryLink;
export const fbSetDMCQuoteStatus = sbActive ? (sb.sbSetDMCQuoteStatus as typeof fb.fbSetDMCQuoteStatus) : fb.fbSetDMCQuoteStatus;
export const fbSetQuotePaymentSummary = sbActive ? (sb.sbSetQuotePaymentSummary as typeof fb.fbSetQuotePaymentSummary) : fb.fbSetQuotePaymentSummary;
export const fbSetQuoteStatus = sbActive ? (sb.sbSetQuoteStatus as typeof fb.fbSetQuoteStatus) : fb.fbSetQuoteStatus;
export const fbSetRegularEntryLink = sbActive ? (sb.sbSetRegularEntryLink as typeof fb.fbSetRegularEntryLink) : fb.fbSetRegularEntryLink;
export const fbSetThreadStatus = sbActive ? (sb.sbSetThreadStatus as typeof fb.fbSetThreadStatus) : fb.fbSetThreadStatus;
export const fbSubscribeAuditLog = sbActive ? (sb.sbSubscribeAuditLog as typeof fb.fbSubscribeAuditLog) : fb.fbSubscribeAuditLog;
export const fbSubscribeChats = sbActive ? (sb.sbSubscribeChats as typeof fb.fbSubscribeChats) : fb.fbSubscribeChats;
export const fbSubscribeContracts = sbActive ? (sb.sbSubscribeContracts as typeof fb.fbSubscribeContracts) : fb.fbSubscribeContracts;
export const fbSubscribeCustomers = sbActive ? (sb.sbSubscribeCustomers as typeof fb.fbSubscribeCustomers) : fb.fbSubscribeCustomers;
export const fbSubscribeDMCQuoteHistory = sbActive ? (sb.sbSubscribeDMCQuoteHistory as typeof fb.fbSubscribeDMCQuoteHistory) : fb.fbSubscribeDMCQuoteHistory;
export const fbSubscribeFxRates = sbActive ? (sb.sbSubscribeFxRates as typeof fb.fbSubscribeFxRates) : fb.fbSubscribeFxRates;
export const fbSubscribeItineraries = sbActive ? (sb.sbSubscribeItineraries as typeof fb.fbSubscribeItineraries) : fb.fbSubscribeItineraries;
export const fbSubscribeMasterRC = sbActive ? (sb.sbSubscribeMasterRC as typeof fb.fbSubscribeMasterRC) : fb.fbSubscribeMasterRC;
export const fbSubscribeMenus = sbActive ? (sb.sbSubscribeMenus as typeof fb.fbSubscribeMenus) : fb.fbSubscribeMenus;
export const fbSubscribeNcc = sbActive ? (sb.sbSubscribeNcc as typeof fb.fbSubscribeNcc) : fb.fbSubscribeNcc;
export const fbSubscribeNccProducts = sbActive ? (sb.sbSubscribeNccProducts as typeof fb.fbSubscribeNccProducts) : fb.fbSubscribeNccProducts;
export const fbSubscribeNotifThread = sbActive ? (sb.sbSubscribeNotifThread as typeof fb.fbSubscribeNotifThread) : fb.fbSubscribeNotifThread;
export const fbSubscribeNotifications = sbActive ? (sb.sbSubscribeNotifications as typeof fb.fbSubscribeNotifications) : fb.fbSubscribeNotifications;
export const fbSubscribePaymentApprovals = sbActive ? (sb.sbSubscribePaymentApprovals as typeof fb.fbSubscribePaymentApprovals) : fb.fbSubscribePaymentApprovals;
export const fbSubscribePois = sbActive ? (sb.sbSubscribePois as typeof fb.fbSubscribePois) : fb.fbSubscribePois;
export const fbSubscribeQuoteHistory = sbActive ? (sb.sbSubscribeQuoteHistory as typeof fb.fbSubscribeQuoteHistory) : fb.fbSubscribeQuoteHistory;
export const fbSubscribeRestaurants = sbActive ? (sb.sbSubscribeRestaurants as typeof fb.fbSubscribeRestaurants) : fb.fbSubscribeRestaurants;
export const fbSubscribeTourPayments = sbActive ? (sb.sbSubscribeTourPayments as typeof fb.fbSubscribeTourPayments) : fb.fbSubscribeTourPayments;
export const fbSubscribeVisaProcs = sbActive ? (sb.sbSubscribeVisaProcs as typeof fb.fbSubscribeVisaProcs) : fb.fbSubscribeVisaProcs;
export const fbSubscribeVisaProducts = sbActive ? (sb.sbSubscribeVisaProducts as typeof fb.fbSubscribeVisaProducts) : fb.fbSubscribeVisaProducts;
export const fbSubscribeVisaProjects = sbActive ? (sb.sbSubscribeVisaProjects as typeof fb.fbSubscribeVisaProjects) : fb.fbSubscribeVisaProjects;
export const fbToggleChatReaction = sbActive ? (sb.sbToggleChatReaction as typeof fb.fbToggleChatReaction) : fb.fbToggleChatReaction;
export const fbUpdateCollaborators = sbActive ? (sb.sbUpdateCollaborators as typeof fb.fbUpdateCollaborators) : fb.fbUpdateCollaborators;
export const fbUpdateDMCCollaborators = sbActive ? (sb.sbUpdateDMCCollaborators as typeof fb.fbUpdateDMCCollaborators) : fb.fbUpdateDMCCollaborators;
