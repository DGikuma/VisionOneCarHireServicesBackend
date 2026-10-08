// server/controllers/travelEnquiryController.ts
import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { TravelEnquiryData, Traveller } from '../types/travel';

/* ─────────── Brand constants ─────────── */
const BRAND = {
    coral: '#FF6B35',
    coralLight: '#FF8B35',
    slate: '#0F172A',
    gold: '#D4AF37',
    goldLight: '#F4D77A',
    cream: '#FFF8E7',
    green: '#0B6E4F',
    logo: 'https://www.visionwanservices.com/assets/images/visionWan_travels.png',
    site: 'https://visionwanservices.com',
    replyTo: 'visionwanservices@gmail.com',
    phones: {
        kenya: '+254 705 336 311',
        uk: '+44 7397 549 590',
    },
};

/* ─────────── Safari tour name map (mirrors frontend) ─────────── */
const SAFARI_TOUR_NAMES: Record<string, string> = {
    'maasai-mara': 'Maasai Mara Signature (3 days)',
    amboseli: 'Amboseli Elephant Trail (4 days)',
    diani: 'Diani Beach & Safari Combo (6 days)',
    samburu: 'Samburu Special Five (3 days)',
};

/* ─────────── Star-rating labels ─────────── */
const STAR_LABELS: Record<string, string> = {
    '3': '3-star and up',
    '4': '4-star and up',
    '5': '5-star only',
    any: 'Any star rating',
};

/* ─────────── Trip-type display labels ─────────── */
const TRIP_LABELS: Record<string, string> = {
    flight: 'Flight',
    'flight-hotel': 'Flight + Hotel',
    safari: 'Safari',
};

/* ─────────── In-memory storage ─────────── */
const travelEnquiries: TravelEnquiryData[] = [];

/* ─────────── Helpers ─────────── */
const escapeHtml = (input: unknown): string => {
    if (input === null || input === undefined) return '';
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return escapeHtml(dateStr);
    return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const formatDateTime = (dateStr?: string): string => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return escapeHtml(dateStr);
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

/* ─────────── Nodemailer Transporter ─────────── */
const createTransporter = () => {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('Missing email configuration in environment variables');
    }
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
    });
};

/* ═══════════════════════════════════════════════════════════════
   Shared HTML fragments (matches bookingController.ts styling)
   ═══════════════════════════════════════════════════════════════ */

const emailHead = (title: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
`;

const emailFoot = () => `</body></html>`;

const brandedHeader = (opts: {
    title: string;
    subtitle: string;
    badge?: string;
    accentFrom?: string;
    accentTo?: string;
}) => {
    const from = opts.accentFrom ?? BRAND.coral;
    const to = opts.accentTo ?? BRAND.coralLight;
    return `
    <tr>
        <td align="center" style="padding:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${from};background:linear-gradient(135deg,${from} 0%,${to} 65%,${BRAND.gold} 130%);border-radius:20px 20px 0 0;">
                <tr>
                    <td align="center" style="padding:32px 24px 26px;">
                        <img
                            src="${BRAND.logo}"
                            alt="Vision Wan Services"
                            width="88" height="88"
                            style="display:block;margin:0 auto 14px;width:88px;height:88px;border-radius:50%;background:#ffffff;padding:6px;border:4px solid rgba(255,255,255,0.75);object-fit:contain;box-shadow:0 12px 28px -10px rgba(0,0,0,0.35);"
                        />
                        ${
                            opts.badge
                                ? `<div style="display:inline-block;padding:5px 14px;border-radius:999px;background:rgba(255,255,255,0.22);border:1px solid rgba(255,255,255,0.45);color:#fff;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">${escapeHtml(opts.badge)}</div>`
                                : ''
                        }
                        <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.25;font-weight:900;letter-spacing:-0.4px;text-shadow:0 2px 12px rgba(0,0,0,0.25);">
                            ${escapeHtml(opts.title)}
                        </h1>
                        <p style="margin:8px auto 0;max-width:520px;color:rgba(255,255,255,0.94);font-size:14px;line-height:1.55;">
                            ${escapeHtml(opts.subtitle)}
                        </p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>`;
};

const sectionCard = (
    iconEmoji: string,
    title: string,
    bodyHtml: string,
    accent: string = BRAND.coral
) => `
    <tr>
        <td style="padding:16px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
                <tr>
                    <td style="padding:18px 20px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                                <td width="6" valign="top" style="padding-right:12px;">
                                    <div style="width:4px;height:22px;background:${accent};border-radius:999px;"></div>
                                </td>
                                <td valign="middle">
                                    <h2 style="margin:0;font-size:13.5px;font-weight:900;color:${BRAND.slate};letter-spacing:1.6px;text-transform:uppercase;">
                                        <span style="margin-right:8px;">${iconEmoji}</span>${escapeHtml(title)}
                                    </h2>
                                </td>
                            </tr>
                        </table>
                        <div style="height:14px;"></div>
                        ${bodyHtml}
                    </td>
                </tr>
            </table>
        </td>
    </tr>`;

const infoRow = (label: string, value: string, highlight = false) => `
    <tr>
        <td style="padding:8px 0;border-bottom:1px dashed #eef2f7;font-size:13.5px;color:#64748b;font-weight:700;width:42%;vertical-align:top;">
            ${escapeHtml(label)}
        </td>
        <td style="padding:8px 0;border-bottom:1px dashed #eef2f7;font-size:13.5px;color:${highlight ? BRAND.coral : BRAND.slate};font-weight:800;text-align:right;vertical-align:top;word-break:break-word;">
            ${value}
        </td>
    </tr>`;

const infoTableStart = () =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">`;
const infoTableEnd = () => `</table>`;

const travellersTable = (travellers: Traveller[]) => {
    if (!travellers?.length)
        return '<p style="margin:0;color:#64748b;font-size:13.5px;">No travellers provided.</p>';
    const rows = travellers
        .map(
            (t, i) => `
            <tr>
                <td style="padding:10px 0;border-bottom:1px dashed #eef2f7;font-size:13.5px;color:${BRAND.slate};font-weight:700;">
                    <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${BRAND.coral};color:#fff;font-size:11px;font-weight:900;margin-right:10px;">${i + 1}</span>
                    ${escapeHtml(t.fullName || '—')}
                </td>
                <td style="padding:10px 0;border-bottom:1px dashed #eef2f7;font-size:13.5px;color:${BRAND.slate};font-weight:800;text-align:right;width:80px;">
                    ${escapeHtml(t.age || '—')} yrs
                </td>
            </tr>`
        )
        .join('');
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`;
};

const flexibilityBadges = (before?: boolean, after?: boolean) => {
    const badges: string[] = [];
    if (before)
        badges.push(
            `<span style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,107,53,0.10);border:1px solid rgba(255,107,53,0.3);color:${BRAND.coral};font-size:12px;font-weight:800;letter-spacing:0.5px;margin:4px 4px 0 0;">-3 days flexible</span>`
        );
    if (after)
        badges.push(
            `<span style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.35);color:#7c5a00;font-size:12px;font-weight:800;letter-spacing:0.5px;margin:4px 4px 0 0;">+3 days flexible</span>`
        );
    if (!badges.length)
        badges.push(
            `<span style="display:inline-block;padding:6px 12px;border-radius:999px;background:#f1f5f9;border:1px solid #e2e8f0;color:#64748b;font-size:12px;font-weight:700;">Exact dates only</span>`
        );
    return `<div>${badges.join('')}</div>`;
};

const ctaButton = (href: string, label: string, tone: 'primary' | 'ghost' = 'primary') => {
    const primary = `background:${BRAND.coral};background:linear-gradient(135deg,${BRAND.coral} 0%,${BRAND.coralLight} 100%);color:#ffffff;box-shadow:0 12px 26px -12px rgba(255,107,53,0.7);`;
    const ghost = `background:transparent;color:${BRAND.coral};border:1.5px solid ${BRAND.coral};`;
    return `
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:800;font-size:13.5px;letter-spacing:0.3px;${tone === 'primary' ? primary : ghost}">
            ${escapeHtml(label)}
        </a>`;
};

const brandedFooter = () => `
    <tr>
        <td style="padding:26px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.slate};border-radius:14px;overflow:hidden;">
                <tr>
                    <td align="center" style="padding:22px 18px;">
                        <p style="margin:0 0 6px;color:#ffffff;font-weight:900;font-size:14px;letter-spacing:0.4px;">
                            Vision Wan Services
                        </p>
                        <p style="margin:0 0 12px;color:rgba(255,255,255,0.65);font-size:12px;">
                            Air Travel · Safaris · Executive Mobility
                        </p>
                        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12.5px;line-height:1.7;">
                            Kenya: <a href="tel:+254705336311" style="color:${BRAND.goldLight};text-decoration:none;font-weight:700;">${BRAND.phones.kenya}</a>
                            &nbsp;·&nbsp;
                            UK: <a href="tel:+447397549590" style="color:${BRAND.goldLight};text-decoration:none;font-weight:700;">${BRAND.phones.uk}</a>
                        </p>
                        <p style="margin:8px 0 0;">
                            <a href="${BRAND.site}" style="color:${BRAND.goldLight};text-decoration:none;font-size:12.5px;font-weight:700;">${BRAND.site.replace('https://', '')}</a>
                            &nbsp;·&nbsp;
                            <a href="mailto:${BRAND.replyTo}" style="color:${BRAND.goldLight};text-decoration:none;font-size:12.5px;font-weight:700;">${BRAND.replyTo}</a>
                        </p>
                        <p style="margin:14px 0 0;color:rgba(255,255,255,0.45);font-size:11px;">
                            © ${new Date().getFullYear()} Vision Wan Services. All rights reserved.
                        </p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>`;

/* ═══════════════════════════════════════════════════════════════
   Admin notification email
   ═══════════════════════════════════════════════════════════════ */

const buildAdminEmail = (enquiry: TravelEnquiryData): string => {
    const isFlight = enquiry.tripType === 'flight';
    const isFlightHotel = enquiry.tripType === 'flight-hotel';
    const isSafari = enquiry.tripType === 'safari';
    const tripLabel = TRIP_LABELS[enquiry.tripType] || enquiry.tripType;

    const tourName = enquiry.safariTourId
        ? SAFARI_TOUR_NAMES[enquiry.safariTourId] || enquiry.safariTourId
        : null;

    /* ── Flight section (used for both `flight` and `flight-hotel`) ── */
    const flightSection = `${infoTableStart()}
        ${infoRow(
            'Route',
            `${escapeHtml(enquiry.fromCity || '—')} → ${escapeHtml(enquiry.toCity || '—')}`,
            true
        )}
        ${infoRow('Departure', formatDate(enquiry.departDate))}
        ${infoRow('Return', formatDate(enquiry.returnDate))}
    ${infoTableEnd()}
    <div style="height:12px;"></div>
    ${flexibilityBadges(enquiry.flexibleBefore, enquiry.flexibleAfter)}`;

    /* ── Safari section ── */
    const safariSection = `${infoTableStart()}
        ${infoRow('Safari tour', escapeHtml(tourName || '—'), true)}
        ${infoRow('Departure', formatDate(enquiry.departDate))}
        ${infoRow('Return', formatDate(enquiry.returnDate))}
    ${infoTableEnd()}
    <div style="height:12px;"></div>
    ${flexibilityBadges(enquiry.flexibleBefore, enquiry.flexibleAfter)}`;

    /* ── Hotel section (only used in `flight-hotel`) ── */
    const hotelSection = enquiry.hotel
        ? `${infoTableStart()}
            ${infoRow('Hotel city', escapeHtml(enquiry.hotel.city), true)}
            ${infoRow('Check-in', formatDate(enquiry.hotel.checkIn))}
            ${infoRow('Check-out', formatDate(enquiry.hotel.checkOut))}
            ${infoRow('Rooms', String(enquiry.hotel.rooms))}
            ${infoRow(
                'Star preference',
                STAR_LABELS[enquiry.hotel.starPreference] || 'Any'
            )}
            ${infoRow(
                'Brand preference',
                escapeHtml(enquiry.hotel.preferredHotel || '—')
            )}
        ${infoTableEnd()}`
        : `<p style="margin:0;color:#64748b;font-size:13.5px;">No hotel details provided.</p>`;

    /* ── Contact body ── */
    const contactBody = `${infoTableStart()}
        ${infoRow('Name', escapeHtml(enquiry.contactName))}
        ${infoRow(
            'Email',
            `<a href="mailto:${escapeHtml(enquiry.contactEmail)}" style="color:${BRAND.coral};text-decoration:none;font-weight:800;">${escapeHtml(enquiry.contactEmail)}</a>`
        )}
        ${infoRow(
            'Phone',
            `<a href="tel:${escapeHtml(enquiry.contactPhone)}" style="color:${BRAND.coral};text-decoration:none;font-weight:800;">${escapeHtml(enquiry.contactPhone)}</a>`
        )}
        ${infoRow('Nationality', escapeHtml(enquiry.nationality || '—'))}
    ${infoTableEnd()}`;

    const notesBody = enquiry.specialRequests
        ? `<div style="padding:12px 14px;background:${BRAND.cream};border:1px dashed ${BRAND.goldLight};border-radius:10px;color:#7c5a00;font-size:13.5px;line-height:1.6;">
                ${escapeHtml(enquiry.specialRequests)}
           </div>`
        : `<p style="margin:0;color:#64748b;font-size:13.5px;">No additional notes.</p>`;

    /* ── Trip body composition depends on trip type ── */
    const tripCards = isFlightHotel
        ? `
            ${sectionCard('🛫', 'Flight details', flightSection)}
            ${sectionCard('🛏️', 'Hotel details', hotelSection, BRAND.gold)}
        `
        : isFlight
        ? sectionCard('🛫', 'Flight details', flightSection)
        : sectionCard('🦁', 'Safari details', safariSection);

    /* ── Header subtitle per trip type ── */
    const headerSubtitle = isFlightHotel
        ? 'A customer has requested a bundled flight + hotel package.'
        : isFlight
        ? 'A customer has requested flight options.'
        : 'A customer has requested a safari package.';

    return `${emailHead(`New ${tripLabel} enquiry — ${enquiry.contactName}`)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;">
        <tr>
            <td align="center" style="padding:32px 14px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:20px;box-shadow:0 24px 60px -30px rgba(15,23,42,0.35);overflow:hidden;">
                    ${brandedHeader({
                        title: 'New Travel Enquiry',
                        subtitle: headerSubtitle,
                        badge: 'Action Required',
                    })}
                    <tr>
                        <td style="padding:26px 26px 30px;">
                            ${tripCards}
                            ${sectionCard('👥', 'Travellers', travellersTable(enquiry.travellers))}
                            ${sectionCard('📇', 'Contact', contactBody)}
                            ${sectionCard('📝', 'Special requests', notesBody)}
                            <div style="height:24px;"></div>
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td align="center">
                                        ${ctaButton(
                                            `mailto:${enquiry.contactEmail}?subject=Re:%20Your%20Vision%20Wan%20travel%20enquiry`,
                                            'Reply to customer'
                                        )}
                                    </td>
                                </tr>
                            </table>
                            <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
                                Received ${formatDateTime(
                                    enquiry.submittedAt || new Date().toISOString()
                                )}
                            </p>
                        </td>
                    </tr>
                    ${brandedFooter()}
                </table>
            </td>
        </tr>
    </table>
${emailFoot()}`;
};

/* ═══════════════════════════════════════════════════════════════
   Customer auto-reply email
   ═══════════════════════════════════════════════════════════════ */

const buildCustomerReply = (enquiry: TravelEnquiryData): string => {
    const isFlight = enquiry.tripType === 'flight';
    const isFlightHotel = enquiry.tripType === 'flight-hotel';
    const isSafari = enquiry.tripType === 'safari';
    const tripLabel = TRIP_LABELS[enquiry.tripType] || enquiry.tripType;

    const tourName = enquiry.safariTourId
        ? SAFARI_TOUR_NAMES[enquiry.safariTourId] || enquiry.safariTourId
        : null;

    /* ── Summary section ── */
    const summaryBody = `${infoTableStart()}
        ${infoRow('Enquiry type', tripLabel, true)}
        ${
            isSafari
                ? infoRow('Tour', escapeHtml(tourName || '—'))
                : infoRow(
                      'Route',
                      `${escapeHtml(enquiry.fromCity || '—')} → ${escapeHtml(
                          enquiry.toCity || '—'
                      )}`
                  )
        }
        ${infoRow('Departure', formatDate(enquiry.departDate))}
        ${infoRow('Return', formatDate(enquiry.returnDate))}
        ${
            isFlightHotel && enquiry.hotel
                ? infoRow(
                      'Hotel',
                      `${escapeHtml(enquiry.hotel.city)} · ${enquiry.hotel.rooms} room${
                          enquiry.hotel.rooms > 1 ? 's' : ''
                      } · ${
                          STAR_LABELS[enquiry.hotel.starPreference] || 'Any'
                      }`
                  )
                : ''
        }
        ${infoRow('Travellers', String(enquiry.travellers?.length || 0))}
    ${infoTableEnd()}`;

    /* ── Next steps ── */
    const step2Copy = isFlightHotel
        ? 'We prepare your flight + hotel bundle with total pricing.'
        : isFlight
        ? 'We prepare flight options with pricing.'
        : 'We prepare your safari quote with pricing.';

    const nextStepsBody = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="padding:6px 0;font-size:13.5px;color:${BRAND.slate};line-height:1.6;">
                <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${BRAND.coral};color:#fff;font-size:11px;font-weight:900;margin-right:10px;">1</span>
                Our travel desk reviews your request.
            </td></tr>
            <tr><td style="padding:6px 0;font-size:13.5px;color:${BRAND.slate};line-height:1.6;">
                <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${BRAND.coral};color:#fff;font-size:11px;font-weight:900;margin-right:10px;">2</span>
                ${escapeHtml(step2Copy)}
            </td></tr>
            <tr><td style="padding:6px 0;font-size:13.5px;color:${BRAND.slate};line-height:1.6;">
                <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${BRAND.coral};color:#fff;font-size:11px;font-weight:900;margin-right:10px;">3</span>
                You receive a personalised reply within <strong>24 hours</strong>.
            </td></tr>
            <tr><td style="padding:6px 0;font-size:13.5px;color:${BRAND.slate};line-height:1.6;">
                <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${BRAND.coral};color:#fff;font-size:11px;font-weight:900;margin-right:10px;">4</span>
                No payment is taken until you approve the quote.
            </td></tr>
        </table>`;

    /* ── Greeting sentence ── */
    const greetingLine = isFlightHotel
        ? "We've received your flight + hotel enquiry and our travel desk is already reviewing it. Expect a personalised bundled quote within <strong>24 hours</strong>."
        : isFlight
        ? "We've received your flight enquiry and our travel desk is already reviewing it. Expect a personalised reply within <strong>24 hours</strong>."
        : "We've received your safari enquiry and our safari specialists are already reviewing it. Expect a personalised reply within <strong>24 hours</strong>.";

    /* ── Header subtitle ── */
    const headerSubtitle = isFlightHotel
        ? 'Our travel desk will respond by email within 24 hours with a bundled flight + hotel quote.'
        : 'Our travel desk will respond by email within 24 hours with your personalised quote.';

    return `${emailHead('We received your enquiry — Vision Wan Services')}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;">
        <tr>
            <td align="center" style="padding:32px 14px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:20px;box-shadow:0 24px 60px -30px rgba(15,23,42,0.35);overflow:hidden;">
                    ${brandedHeader({
                        title: 'Your enquiry has been received',
                        subtitle: headerSubtitle,
                        badge: 'Booking Received',
                    })}
                    <tr>
                        <td style="padding:26px 26px 30px;">
                            <p style="margin:0 0 6px;font-size:15px;color:${BRAND.slate};font-weight:800;">
                                Hi ${escapeHtml(
                                    enquiry.contactName.split(' ')[0] ||
                                        enquiry.contactName
                                )},
                            </p>
                            <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">
                                Thank you for choosing <strong>Vision Wan Services</strong>.
                                ${greetingLine}
                            </p>

                            ${sectionCard('📋', 'Your enquiry at a glance', summaryBody)}

                            ${sectionCard('⚡', 'What happens next', nextStepsBody, BRAND.gold)}

                            <div style="height:22px;"></div>

                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.cream};border:1px dashed ${BRAND.goldLight};border-radius:14px;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <p style="margin:0 0 8px;font-size:13px;font-weight:900;color:#7c5a00;letter-spacing:1.4px;text-transform:uppercase;">
                                            Need to reach us sooner?
                                        </p>
                                        <p style="margin:0 0 14px;font-size:13.5px;color:#475569;line-height:1.65;">
                                            Call us directly — our travel desk is available 24/7 for premium enquiries.
                                        </p>
                                        <div>
                                            ${ctaButton(`tel:+254705336311`, 'Call Kenya +254 705 336 311')}
                                            &nbsp;
                                            ${ctaButton(`tel:+447397549590`, 'Call UK +44 7397 549 590', 'ghost')}
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.7;">
                                Warm regards,<br>
                                <strong style="color:${BRAND.slate};">The Vision Wan Travel Desk</strong><br>
                                Air Travel · Safaris · Executive Mobility
                            </p>
                        </td>
                    </tr>
                    ${brandedFooter()}
                </table>
            </td>
        </tr>
    </table>
${emailFoot()}`;
};

/* ═══════════════════════════════════════════════════════════════
   Create Travel Enquiry
   ═══════════════════════════════════════════════════════════════ */

export const createTravelEnquiry = async (req: Request, res: Response) => {
    try {
        const enquiryId = `TW-${Date.now().toString().slice(-8)}`;
        const submittedAt = new Date().toISOString();

        const enquiry: TravelEnquiryData = {
            id: enquiryId,
            tripType: req.body.tripType,
            fromCity: req.body.fromCity,
            toCity: req.body.toCity,
            departDate: req.body.departDate,
            returnDate: req.body.returnDate,
            flexibleBefore: req.body.flexibleBefore,
            flexibleAfter: req.body.flexibleAfter,
            safariTourId: req.body.safariTourId,
            hotel: req.body.hotel,
            travellers: req.body.travellers,
            contactName: req.body.contactName,
            contactPhone: req.body.contactPhone,
            contactEmail: req.body.contactEmail,
            nationality: req.body.nationality,
            specialRequests: req.body.specialRequests,
            submittedAt,
            status: 'received',
            source: req.body.source || 'visionwan-air-travel',
        };

        travelEnquiries.push(enquiry);

        const tripLabel = TRIP_LABELS[enquiry.tripType] || enquiry.tripType;
        console.log(`✈️ Travel enquiry recorded: ${enquiryId}`);
        console.log(`   Trip type: ${tripLabel}`);
        console.log(`   Contact: ${enquiry.contactName} <${enquiry.contactEmail}>`);
        console.log(`   Travellers: ${enquiry.travellers.length}`);
        if (enquiry.tripType === 'flight' || enquiry.tripType === 'flight-hotel') {
            console.log(`   Route: ${enquiry.fromCity} → ${enquiry.toCity}`);
        }
        if (enquiry.tripType === 'flight-hotel' && enquiry.hotel) {
            console.log(
                `   Hotel: ${enquiry.hotel.city} · ${enquiry.hotel.rooms} room(s) · ${
                    STAR_LABELS[enquiry.hotel.starPreference] || 'Any'
                }`
            );
        }
        if (enquiry.tripType === 'safari') {
            console.log(`   Safari: ${enquiry.safariTourId}`);
        }

        // Respond immediately — emails go out in the background
        res.status(201).json({
            success: true,
            message: 'Enquiry received. We will respond by email within 24 hours.',
            enquiry: {
                id: enquiryId,
                tripType: enquiry.tripType,
                contactName: enquiry.contactName,
                contactEmail: enquiry.contactEmail,
                travellersCount: enquiry.travellers.length,
                submittedAt,
                status: enquiry.status,
            },
        });

        // Send emails in the background
        setTimeout(async () => {
            try {
                const transporter = createTransporter();
                const adminTo = process.env.ADMIN_EMAIL || BRAND.replyTo;
                const fromAddress =
                    process.env.EMAIL_FROM ||
                    `"Vision Wan Services" <${process.env.EMAIL_USER}>`;

                // 1. Admin notification
                try {
                    await transporter.sendMail({
                        from: fromAddress,
                        to: adminTo,
                        replyTo: enquiry.contactEmail,
                        subject: `✈️ New ${tripLabel} enquiry — ${enquiry.contactName}`,
                        html: buildAdminEmail(enquiry),
                    });
                    console.log(`✅ Admin notification sent for ${enquiryId}`);
                } catch (adminErr) {
                    console.error(
                        `❌ Admin notification failed for ${enquiryId}:`,
                        adminErr
                    );
                }

                // 2. Customer auto-reply
                try {
                    await transporter.sendMail({
                        from: fromAddress,
                        to: enquiry.contactEmail,
                        replyTo: adminTo,
                        subject: `✅ We've received your ${tripLabel} enquiry — Vision Wan Services`,
                        html: buildCustomerReply(enquiry),
                    });
                    console.log(`✅ Auto-reply sent to ${enquiry.contactEmail}`);
                } catch (custErr) {
                    console.error(
                        `❌ Customer auto-reply failed for ${enquiryId}:`,
                        custErr
                    );
                }
            } catch (emailErr) {
                console.error(
                    `❌ Email dispatch failed for ${enquiryId}:`,
                    emailErr
                );
            }
        }, 0);
    } catch (error) {
        console.error('❌ Travel enquiry creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to record enquiry',
            message:
                process.env.NODE_ENV === 'development'
                    ? (error as Error).message
                    : undefined,
        });
    }
};