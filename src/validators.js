const { z } = require('zod');

const registerSchema = z.object({
    username: z.string()
        .trim()
        .min(3, { message: 'Nazwa użytkownika musi mieć co najmniej 3 znaki' })
        .max(20, { message: 'Nazwa użyttkownika nie może przekraczać 20 znaków' })
        .regex(/^[a-zA-Z0-9_]+$/, { message: 'Nazwa może zawierać tylko litery, cyfry i podłogę (_)' }),

    email: z.string()
        .trim()
        .toLowerCase()
        .email({ message: 'Podaj poprawny adres e-mail' }),

    password: z.string()
        .min(8, 'Hasło musi mieć min. 8 znaków')
        .regex(/[A-Z]/, { message: 'Hasło musi zawierać przynajmniej jedną wielką literę' })
        .regex(/[a-z]/, { message: 'Hasło musi zawierać przynajmniej jedną małą literę' })
        .regex(/[0-9]/, { message: 'Hasło musi zawierać przynajmniej jedną cyfrę' })
        .regex(/[^a-zA-Z0-9]/, { message: 'Hasło musi zawierać przynajmniej jeden znak specjalny' })
});

const postSchema = z.object({
    title: z.string().trim().min(3, 'Tytuł za krótki').max(100, 'Tytuł za długi'),
    content: z.string().trim().min(5, 'Treść za krótka').max(5000, 'Treść za długa'),
    category: z.string().trim().optional().default('Devlog')
});

const profileSchema = z.object({
    username: z.string().trim().min(3, 'Nazwa użytkownika musi mieć min. 3 znaki').max(20, 'Nazwa użytkownika max. 20 znaków'),
    email: z.string().trim().toLowerCase().email('Podaj poprawny adres e-mail'),
    bio: z.string().trim().max(500, 'Bio może mieć max. 500 znaków').optional().default('')
});

const forumThreadSchema = z.object({
    title: z.string().trim().min(3, 'Tytuł wątku za krótki').max(120, 'Tytuł wątku za długi'),
    content: z.string().trim().min(5, 'Treść wątku za krótka').max(5000, 'Treść za długa')
});

function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {

            const firstError = result.error.issues[0]?.message || 'Błędne dane wejściowe';
            return res.status(400).json({ error: firstError });
        }
        req.body = result.data;
        next();
    };
}

module.exports = {
    registerSchema,
    postSchema,
    profileSchema,
    forumThreadSchema,
    validate
};
