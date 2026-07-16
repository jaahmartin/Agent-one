import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { appointments, artisans, leads, messages, reminders, revenues } from "../db/schema";

/**
 * Seed de l'artisan de démonstration (lien fixe /dashboard/demo-fenn), avec
 * des données fictives réalistes couvrant tous les onglets du dashboard.
 * Ré-exécutable : repart de zéro à chaque lancement (supprime puis recrée),
 * pour permettre à Mathéo de "réinitialiser" la démo avant un rendez-vous
 * commercial.
 *
 *   npm run seed:demo
 */
const DEMO_TOKEN = "demo-fenn";

function daysFromNow(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function main() {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(artisans)
    .where(eq(artisans.dashboardToken, DEMO_TOKEN))
    .limit(1);

  let artisanId: string;
  if (existing) {
    // Repart de zéro : supprime toutes les données liées à l'ancien artisan démo.
    const oldLeads = await db.select({ id: leads.id }).from(leads).where(eq(leads.artisanId, existing.id));
    for (const { id: leadId } of oldLeads) {
      await db.delete(reminders).where(eq(reminders.leadId, leadId));
      await db.delete(appointments).where(eq(appointments.leadId, leadId));
      await db.delete(messages).where(eq(messages.leadId, leadId));
    }
    await db.delete(revenues).where(eq(revenues.artisanId, existing.id));
    await db.delete(leads).where(eq(leads.artisanId, existing.id));
    await db.delete(artisans).where(eq(artisans.id, existing.id));
  }

  const [artisan] = await db
    .insert(artisans)
    .values({
      name: "Jean-Marc Plomberie",
      contactFirstName: "Jean-Marc",
      twilioNumber: "+33900000001",
      forwardingNumber: "+33600000001",
      dashboardToken: DEMO_TOKEN,
      isDemo: true,
      notificationEmail: "jm.plomberie@gmail.com",
      subscriptionStatus: "Actif",
      subscriptionRenewsOn: daysFromNow(28, 9),
    })
    .returning();
  artisanId = artisan.id;

  async function addLead(params: {
    clientPhone: string;
    name: string;
    problemType: string;
    address: string;
    urgent: boolean;
    status: (typeof leads.$inferInsert)["status"];
    confirmedBy?: "sms" | "manuel" | null;
    confirmedAt?: Date | null;
    createdAt?: Date;
    conversation: Array<{ direction: "in" | "out"; body: string; at?: Date }>;
  }) {
    const leadCreatedAt = params.createdAt ?? new Date();
    const [lead] = await db
      .insert(leads)
      .values({
        artisanId,
        clientPhone: params.clientPhone,
        name: params.name,
        problemType: params.problemType,
        address: params.address,
        urgent: params.urgent,
        status: params.status,
        confirmedBy: params.confirmedBy ?? null,
        confirmedAt: params.confirmedAt ?? null,
        createdAt: leadCreatedAt,
        updatedAt: leadCreatedAt,
      })
      .returning();
    let messageTime = leadCreatedAt;
    for (const m of params.conversation) {
      messageTime = m.at ?? new Date(messageTime.getTime() + 60_000);
      await db.insert(messages).values({ leadId: lead.id, direction: m.direction, body: m.body, createdAt: messageTime });
    }
    return lead;
  }

  // --- "À rappeler" : 5 contacts sans suite confirmée, dates étalées sur les derniers jours ---
  const sylvie = await addLead({
    clientPhone: "+33612345678",
    name: "Sylvie Marchand",
    problemType: "Fuite salle de bain",
    address: "12 rue des Lilas, Toulouse",
    urgent: true,
    status: "en_qualification",
    createdAt: hoursAgo(2),
    conversation: [
      { direction: "out", body: "Bonjour, ici l'assistant de Jean-Marc Plomberie, pouvez-vous préciser votre problème et votre adresse ?" },
      { direction: "in", body: "Fuite sous l'évier de la salle de bain, dispo toute la journée." },
    ],
  });
  const karim = await addLead({
    clientPhone: "+33698765432",
    name: "Karim Belaïd",
    problemType: "Devis chauffe-eau",
    address: "8 avenue Jean Jaurès, Toulouse",
    urgent: false,
    status: "creneau_propose",
    createdAt: daysFromNow(-1, 11, 2),
    conversation: [
      { direction: "out", body: "Bonjour, ici l'assistant de Jean-Marc Plomberie, je prends note de votre demande de devis chauffe-eau, un créneau vous convient-il cette semaine ?" },
      { direction: "in", body: "Oui plutôt jeudi si possible, merci." },
    ],
  });
  const antoine = await addLead({
    clientPhone: "+33745128903",
    name: "Antoine Roques",
    problemType: "Urgence plomberie",
    address: "3 place du Capitole, Toulouse",
    urgent: true,
    status: "en_qualification",
    createdAt: hoursAgo(0.5),
    conversation: [
      { direction: "out", body: "Bonjour, ici l'assistant de Jean-Marc Plomberie, pouvez-vous préciser l'urgence de votre demande ?" },
    ],
  });
  const nadia = await addLead({
    clientPhone: "+33633210987",
    name: "Nadia Ferrand",
    problemType: "Robinetterie",
    address: "22 rue de la République, Toulouse",
    urgent: false,
    status: "creneau_propose",
    createdAt: daysFromNow(-2, 10, 12),
    conversation: [
      { direction: "out", body: "Bonjour, ici l'assistant de Jean-Marc Plomberie. Robinetterie à changer, c'est bien ça ?" },
      { direction: "in", body: "Oui c'est ça, pas d'urgence particulière." },
    ],
  });
  const julien = await addLead({
    clientPhone: "+33712459033",
    name: "Julien Faure",
    problemType: "Chaudière",
    address: "45 boulevard de Strasbourg, Toulouse",
    urgent: true,
    status: "en_qualification",
    createdAt: hoursAgo(5),
    conversation: [
      { direction: "out", body: "Bonjour, ici l'assistant de Jean-Marc Plomberie, votre chaudière est-elle toujours en panne ?" },
      { direction: "in", body: "Oui, plus de chauffage depuis ce matin." },
    ],
  });

  // --- Rendez-vous confirmés À VENIR (aujourd'hui / cette semaine / ce mois-ci) : pas encore de CA, le chantier n'a pas encore eu lieu ---
  async function addUpcomingAppointment(params: {
    clientPhone: string;
    name: string;
    problemType: string;
    address: string;
    dayOffset: number;
    hour: number;
  }) {
    const start = daysFromNow(params.dayOffset, params.hour);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    // Le lead a été qualifié 1 jour avant le rendez-vous (aujourd'hui même
    // pour un RDV pris le jour-même).
    const lead = await addLead({
      clientPhone: params.clientPhone,
      name: params.name,
      problemType: params.problemType,
      address: params.address,
      urgent: false,
      status: "confirme",
      confirmedBy: "sms",
      confirmedAt: daysFromNow(params.dayOffset > 0 ? -1 : 0, 18),
      createdAt: params.dayOffset > 0 ? daysFromNow(-1, 9) : hoursAgo(6),
      conversation: [
        { direction: "out", body: `Bonjour, ici l'assistant de Jean-Marc Plomberie. ${params.problemType}, un créneau vous convient-il ?` },
        { direction: "in", body: "Oui, ça me convient très bien, merci." },
      ],
    });
    const [appointment] = await db
      .insert(appointments)
      .values({ leadId: lead.id, startTime: start, endTime: end, status: "confirmed", confirmedAt: new Date() })
      .returning();
    return { lead, appointment };
  }

  await addUpcomingAppointment({
    clientPhone: "+33611223344",
    name: "Marc Dubreuil",
    problemType: "Installation chauffe-eau",
    address: "5 rue Alsace-Lorraine, Toulouse",
    dayOffset: 0,
    hour: 13,
  });
  const { appointment: claireAppt, lead: claireLead } = await addUpcomingAppointment({
    clientPhone: "+33622334455",
    name: "Claire Dupuis",
    problemType: "Installation mitigeur",
    address: "17 rue Bayard, Toulouse",
    dayOffset: 2,
    hour: 9,
  });
  const hugo = await addUpcomingAppointment({
    clientPhone: "+33633445566",
    name: "Hugo Lambert",
    problemType: "Fuite radiateur",
    address: "9 rue du Taur, Toulouse",
    dayOffset: 3,
    hour: 11,
  });
  await addUpcomingAppointment({
    clientPhone: "+33644556677",
    name: "Thomas Petit",
    problemType: "Débouchage canalisation",
    address: "14 allée Jean Jaurès, Toulouse",
    dayOffset: 5,
    hour: 15,
  });
  await addUpcomingAppointment({
    clientPhone: "+33655667788",
    name: "Emma Girard",
    problemType: "Installation évier",
    address: "2 rue Ozenne, Toulouse",
    dayOffset: 6,
    hour: 10,
  });

  // --- Chantiers déjà RÉALISÉS ce mois-ci (chiffre d'affaires réel, jobs déjà passés) ---
  async function addCompletedJobWithRevenue(params: {
    clientPhone: string;
    name: string;
    problemType: string;
    address: string;
    daysAgo: number;
    amountCents: number;
  }) {
    const completedAt = daysFromNow(-params.daysAgo, 14);
    const lead = await addLead({
      clientPhone: params.clientPhone,
      name: params.name,
      problemType: params.problemType,
      address: params.address,
      urgent: false,
      status: "confirme",
      confirmedBy: "sms",
      confirmedAt: daysFromNow(-params.daysAgo - 1, 18),
      createdAt: daysFromNow(-params.daysAgo - 1, 9),
      conversation: [
        { direction: "out", body: `Bonjour, ici l'assistant de Jean-Marc Plomberie. ${params.problemType}, un créneau vous convient-il ?` },
        { direction: "in", body: "Oui, ça me convient très bien, merci." },
      ],
    });
    await db.insert(appointments).values({
      leadId: lead.id,
      startTime: completedAt,
      endTime: new Date(completedAt.getTime() + 3_600_000),
      status: "confirmed",
      confirmedAt: daysFromNow(-params.daysAgo - 1, 18),
    });
    await db.insert(revenues).values({
      artisanId,
      leadId: lead.id,
      clientName: params.name,
      jobType: params.problemType,
      amountCents: params.amountCents,
      completedAt,
    });
    return lead;
  }

  await addCompletedJobWithRevenue({
    clientPhone: "+33666778899",
    name: "Léa Fontaine",
    problemType: "Remplacement joints",
    address: "31 rue des Filatiers, Toulouse",
    daysAgo: 3,
    amountCents: 18000,
  });
  await addCompletedJobWithRevenue({
    clientPhone: "+33677889900",
    name: "Paul Girardot",
    problemType: "Urgence plomberie",
    address: "6 place Saint-Georges, Toulouse",
    daysAgo: 8,
    amountCents: 80000,
  });
  await addCompletedJobWithRevenue({
    clientPhone: "+33688990011",
    name: "Camille Roy",
    problemType: "Débouchage canalisation",
    address: "10 rue Riquet, Toulouse",
    daysAgo: 14,
    amountCents: 32000,
  });
  await addCompletedJobWithRevenue({
    clientPhone: "+33699001122",
    name: "Nicolas Blanc",
    problemType: "Installation évier",
    address: "27 rue Pargaminières, Toulouse",
    daysAgo: 20,
    amountCents: 58000,
  });

  // --- Relances : aujourd'hui + à venir ---
  await db.insert(reminders).values([
    {
      leadId: julien.id,
      type: "silence_premier_message",
      scheduledFor: daysFromNow(0, 9, 15),
      status: "programmee",
      messageBody: "Bonjour, je reviens vers vous concernant votre chaudière, êtes-vous toujours dans le besoin d'une intervention ?",
    },
    {
      leadId: claireLead.id,
      appointmentId: claireAppt.id,
      type: "rappel_rdv",
      scheduledFor: daysFromNow(0, 11, 40),
      status: "programmee",
      messageBody: "Bonjour, pour rappel vous avez rendez-vous avec Jean-Marc Plomberie dans 2 jours. À bientôt !",
    },
    {
      leadId: karim.id,
      type: "reflexion_j3",
      scheduledFor: daysFromNow(0, 16, 20),
      status: "programmee",
      messageBody: "Bonjour, je me permets de revenir vers vous suite à votre demande de devis, avez-vous eu le temps d'y réfléchir ?",
    },
    {
      leadId: hugo.lead.id,
      appointmentId: hugo.appointment.id,
      type: "rappel_rdv",
      scheduledFor: daysFromNow(1, 10),
      status: "programmee",
      messageBody: "Bonjour, pour rappel vous avez rendez-vous avec Jean-Marc Plomberie dans 2 jours. À bientôt !",
    },
    {
      leadId: nadia.id,
      type: "reflexion_j3",
      scheduledFor: daysFromNow(3, 9),
      status: "programmee",
      messageBody: "Bonjour, je me permets de revenir vers vous suite à votre demande, avez-vous eu le temps d'y réfléchir ?",
    },
  ]);

  console.log(`Artisan démo créé/réinitialisé (id=${artisanId}).`);
  console.log(`Lien démo : /dashboard/${DEMO_TOKEN}`);
  console.log(`(pour info, contacts "à rappeler" : ${[sylvie, karim, antoine, nadia, julien].map((l) => l.name).join(", ")})`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
